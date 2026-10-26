"""Day 3 exercises: counting three ways, and averages and rankings done right.

Reference solution. Needs data/orders from the Day 2 lab.
Run it next to lab_utils.py: python day03.py
"""
from pyspark.sql import Row, Window

from lab_utils import F, count_nodes, get_spark

spark = get_spark("day03", delta=False, avro=False)
orders = spark.read.parquet("data/orders")

# --- Exercise 1: count three ways --------------------------------------------
# Keep exact and approximate counts in separate aggregations. In one agg(),
# Spark computes the sketches inside the distinct count's (status, customer_id)
# step: ~40,000 groups x a 13 KB sketch at rsd 0.01, which runs out of memory.
exact = orders.groupBy("status").agg(
    F.count("*").alias("orders"),
    F.countDistinct("customer_id").alias("exact"),
)
approx = orders.groupBy("status").agg(
    F.approx_count_distinct("customer_id", 0.05).alias("approx_05"),
    F.approx_count_distinct("customer_id", 0.01).alias("approx_01"),
)
result = exact.join(approx, "status").withColumns({
    "err_05": F.abs(F.col("approx_05") - F.col("exact")) / F.col("exact"),
    "err_01": F.abs(F.col("approx_01") - F.col("exact")) / F.col("exact"),
}).orderBy("status")
result.show()
for row in result.collect():
    assert row.err_05 < 0.10 and row.err_01 < 0.03, row

spark.conf.set("spark.sql.adaptive.enabled", "false")
exact_plan = count_nodes(orders.groupBy("status").agg(F.countDistinct("customer_id")), "Exchange")
approx_plan = count_nodes(orders.groupBy("status").agg(F.approx_count_distinct("customer_id")), "Exchange")
print("Exchanges, exact vs approximate:", exact_plan, approx_plan)
assert exact_plan["Exchange"] == 2 and approx_plan["Exchange"] == 1
spark.conf.set("spark.sql.adaptive.enabled", "true")

# --- Exercise 2: the chapter's incomes data ----------------------------------
df = spark.createDataFrame([
    Row(incomes=[123.0, 456.0, 789.0], NAME="Alice"),
    Row(incomes=[234.0, 567.0], NAME="BOB"),
    Row(incomes=[100.0, 200.0, 100.0], NAME="Tom"),
    Row(incomes=[79.0, 128.0], NAME="josh"),
    Row(incomes=[123.0, 145.0, 178.0], NAME="bush"),
    Row(incomes=[111.0, 187.0, 451.0, 188.0, 199.0], NAME="jerry"),
])
incomes = df.select(F.lower("NAME").alias("name"), F.explode("incomes").alias("income"))

true_avg = incomes.agg(F.avg("income")).first()[0]
avg_of_avgs = incomes.groupBy("name").agg(F.avg("income").alias("a")).agg(F.avg("a")).first()[0]
print(f"true average {true_avg:.2f} vs average of per-name averages {avg_of_avgs:.2f}")
assert round(true_avg, 2) != round(avg_of_avgs, 2)

w = Window.partitionBy("name").orderBy(F.desc("income"))
top2 = incomes.withColumn("rn", F.row_number().over(w)).filter("rn <= 2")
top2.orderBy("name", "rn").show()
top3 = incomes.orderBy(F.desc("income")).limit(3)
top3.show()

spark.conf.set("spark.sql.adaptive.enabled", "false")
print("window plan:", count_nodes(top2, "Exchange", "Sort", "Window"))
print("limit plan:", count_nodes(top3, "TakeOrderedAndProject", "Exchange"))
assert count_nodes(top3, "TakeOrderedAndProject")["TakeOrderedAndProject"] == 1
print("day03: all checks passed")
