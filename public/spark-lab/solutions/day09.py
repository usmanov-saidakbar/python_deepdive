"""Day 9 exercises: an idempotent MERGE, and compaction vs Z-ordering.

Reference solution. Needs data/orders from the Day 2 lab.
Run it next to lab_utils.py: python day09.py
"""
import shutil

from delta.tables import DeltaTable
from pyspark.sql import Window

from lab_utils import F, get_spark, make_orders

spark = get_spark("day09")
orders = spark.read.parquet("data/orders").limit(100_000)

# --- Exercise 1: an idempotent upsert ------------------------------------------
shutil.rmtree("delta/orders_merge", ignore_errors=True)
orders.write.format("delta").save("delta/orders_merge")
table = DeltaTable.forPath(spark, "delta/orders_merge")

changed = orders.limit(5).withColumn("amount", F.col("amount") + 1)
new = orders.limit(5).withColumn("order_id", F.col("order_id") + 10_000_000)
source = changed.unionByName(new)


def upsert(src):
    (table.alias("t")
        .merge(src.alias("s"), "t.order_id = s.order_id")
        .whenMatchedUpdateAll(condition="t.amount <> s.amount")   # only rows that really changed
        .whenNotMatchedInsertAll()
        .execute())
    return table.history(1).select("operationMetrics").first()[0]


first = upsert(source)
second = upsert(source)
for label, m in [("first", first), ("second", second)]:
    print(label, "MERGE:", {k: m[k] for k in ("numTargetRowsUpdated", "numTargetRowsInserted")})
assert (first["numTargetRowsUpdated"], first["numTargetRowsInserted"]) == ("5", "5")
assert (second["numTargetRowsUpdated"], second["numTargetRowsInserted"]) == ("0", "0")

# Two source rows for one key: Delta refuses, because it cannot tell which wins.
dupes = source.unionByName(source.limit(1).withColumn("amount", F.lit(1.0)))
try:
    upsert(dupes)
    raise AssertionError("expected a MERGE error")
except Exception as e:
    assert "DELTA_MULTIPLE_SOURCE_ROW_MATCHING_TARGET_ROW_IN_MERGE" in str(e)
    print("duplicate source keys rejected")

latest = Window.partitionBy("order_id").orderBy(F.desc("order_ts"), F.desc("amount"))
deduped = dupes.withColumn("rn", F.row_number().over(latest)).filter("rn = 1").drop("rn")
upsert(deduped)
print("after dedupe the MERGE succeeds")

# --- Exercise 2: compaction vs Z-ordering --------------------------------------
spark.conf.set("spark.databricks.delta.optimize.maxFileSize", str(8 * 1024 * 1024))
for name in ("a", "b"):
    shutil.rmtree(f"delta/{name}", ignore_errors=True)
    for i in range(50):
        make_orders(spark, 20_000, seed=100 + i).write.format("delta").mode("append").save(f"delta/{name}")

compacted = DeltaTable.forPath(spark, "delta/a").optimize().executeCompaction().first()["metrics"]
zordered = DeltaTable.forPath(spark, "delta/b").optimize().executeZOrderBy("customer_id").first()["metrics"]
print("compaction:", compacted["numFilesRemoved"], "->", compacted["numFilesAdded"],
      "| z-order:", zordered["numFilesRemoved"], "->", zordered["numFilesAdded"])

files = {}
for name in ("a", "b"):
    table_files = spark.read.format("delta").load(f"delta/{name}").inputFiles()
    hit = spark.read.format("delta").load(f"delta/{name}").filter("customer_id = 42").inputFiles()
    files[name] = (len(hit), len(table_files))
    print(f"delta/{name}: customer_id = 42 reads {len(hit)} of {len(table_files)} files")
assert files["a"][0] == files["a"][1] and files["b"][0] <= 2
print("day09: all checks passed")
