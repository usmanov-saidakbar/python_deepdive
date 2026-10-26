"""Day 2 exercises: SQL vs the DataFrame API, and wordcount.py ported to DataFrames.

Reference solution. Needs data/orders and data/customers from the Day 2 lab,
and a text file (the Spark README):
    curl -o README.md https://raw.githubusercontent.com/apache/spark/v4.2.0/README.md
Run it next to lab_utils.py: python day02.py
"""
import re
from operator import add

from pyspark.testing import assertDataFrameEqual

from lab_utils import F, get_spark, plan_text

spark = get_spark("day02", delta=False, avro=False)
orders = spark.read.parquet("data/orders")
customers = spark.read.parquet("data/customers")

# --- Exercise 1: one question, two languages --------------------------------
orders.createOrReplaceTempView("orders")
customers.createOrReplaceTempView("customers")
sql_df = spark.sql("""
    SELECT c.country, round(sum(o.amount), 2) AS revenue
    FROM orders o JOIN customers c ON o.customer_id = c.customer_id
    WHERE o.status = 'paid'
    GROUP BY c.country
    ORDER BY revenue DESC
    LIMIT 5
""")
api_df = (
    orders.filter(F.col("status") == "paid")
    .join(customers, "customer_id")
    .groupBy("country")
    .agg(F.round(F.sum("amount"), 2).alias("revenue"))
    .orderBy(F.desc("revenue"))
    .limit(5)
)
assertDataFrameEqual(sql_df, api_df, checkRowOrder=True)


def operators(df):
    """Operator names of the formatted plan tree, top to bottom."""
    tree = plan_text(df, "formatted").split("\n\n")[0].splitlines()[1:]
    return [re.sub(r"\s*\(\d+\)$", "", line).strip(" +-*:") for line in tree]


print("SQL plan:", operators(sql_df))
print("API plan:", operators(api_df))
assert operators(sql_df) == operators(api_df)

# --- Exercise 2: the official wordcount.py, then the DataFrame version ------
lines = spark.read.text("README.md")

# The official example (RDD API).
rdd_counts = dict(
    lines.rdd.map(lambda r: r[0]).flatMap(lambda x: x.split(" ")).map(lambda x: (x, 1)).reduceByKey(add).collect()
)

# DataFrame version: split, explode, group, count.
words = lines.select(F.explode(F.split("value", " ")).alias("word"))
df_counts = words.groupBy("word").count()
top10 = df_counts.orderBy(F.desc("count"), "word").limit(10).collect()
for row in top10:
    assert rdd_counts[row.word] == row["count"], row
print("top 10 words:", [(r.word, r["count"]) for r in top10])

# The partial count before the shuffle is the same map-side combine as reduceByKey.
plan = plan_text(df_counts, "simple")
assert "partial_count" in plan
print("day02: all checks passed")
