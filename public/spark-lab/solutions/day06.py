"""Day 6 exercises: salt a skewed join, and a two-stage distinct count.

Reference solution. Needs data/customers from the Day 2 lab.
Run it next to lab_utils.py: python day06.py
"""
import statistics

from lab_utils import F, get_spark, make_orders, partition_sizes, run

spark = get_spark("day06", delta=False, avro=False)
spark.conf.set("spark.sql.adaptive.enabled", "false")       # see the raw problem
spark.conf.set("spark.sql.autoBroadcastJoinThreshold", -1)  # a broadcast would hide it

make_orders(spark, 4_000_000, hot_share=0.5).write.mode("overwrite").parquet("data/orders_skewed")
s = spark.read.parquet("data/orders_skewed")
cust = spark.read.parquet("data/customers")
N = 16


def skew_ratio(df, *keys):
    """max / median rows per partition after hashing on the join keys."""
    sizes = partition_sizes(df.repartition(64, *keys))
    return sizes[0] / statistics.median(sizes)


# --- Exercise 1: salt a skewed join -------------------------------------------
plain = s.join(cust, "customer_id")
run(plain, "plain join")
print(f"plain: max/median = {skew_ratio(s, 'customer_id'):.1f}")

# (a) Salt every key: the customers side grows 16x.
s_salted = s.withColumn("salt", F.floor(F.rand(1) * N).cast("int"))
cust_x16 = cust.withColumn("salt", F.explode(F.sequence(F.lit(0), F.lit(N - 1))))
salted = s_salted.join(cust_x16, ["customer_id", "salt"]).drop("salt")
run(salted, "salted join")
print(f"salted: max/median = {skew_ratio(s_salted, 'customer_id', 'salt'):.1f}, customers side {cust_x16.count():,} rows")

# (b) Salt only the hot key: every other key keeps salt 0.
hot = F.col("customer_id") == 0
s_hot = s.withColumn("salt", F.when(hot, F.floor(F.rand(1) * N)).otherwise(0).cast("int"))
cust_hot = cust.withColumn(
    "salt", F.explode(F.when(hot, F.sequence(F.lit(0), F.lit(N - 1))).otherwise(F.array(F.lit(0))))
)
hot_salted = s_hot.join(cust_hot, ["customer_id", "salt"]).drop("salt")
run(hot_salted, "hot-key salted join")
print(f"hot-key salted: max/median = {skew_ratio(s_hot, 'customer_id', 'salt'):.1f}, customers side {cust_hot.count():,} rows")

assert plain.count() == salted.count() == hot_salted.count()

# --- Exercise 2: two-stage distinct count -------------------------------------
exact = {r[0]: r[1] for r in s.groupBy("customer_id").agg(F.countDistinct("product_id")).collect()}
two_stage = (
    s.withColumn("salt", F.pmod(F.hash("product_id"), F.lit(N)))   # each product lands in one salt
    .groupBy("customer_id", "salt").agg(F.countDistinct("product_id").alias("c"))
    .groupBy("customer_id").agg(F.sum("c").alias("c"))
)
assert {r[0]: r[1] for r in two_stage.collect()} == exact
print("two-stage distinct count matches the exact one; hot key:", exact[0])
print("day06: all checks passed")
