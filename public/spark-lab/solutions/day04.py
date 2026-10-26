"""Day 4 exercises: five formats, and the datasource.py layouts applied to orders.

Reference solution. Needs data/orders from the Day 2 lab.
Run it next to lab_utils.py: python day04.py
"""
import glob
import os
import re
import shutil
import time

from lab_utils import F, get_spark, plan_text

spark = get_spark("day04")  # Avro needs the package get_spark adds
orders = spark.read.parquet("data/orders").limit(1_000_000).cache()
orders.count()


def folder_mb(path):
    files = [f for f in glob.glob(path + "/**", recursive=True) if os.path.isfile(f)]
    return sum(os.path.getsize(f) for f in files) / 1e6


# --- Exercise 1: five formats, one dataset ----------------------------------
sizes = {}
for fmt in ["csv", "json", "parquet", "orc", "avro"]:
    path = f"formats/{fmt}"
    shutil.rmtree(path, ignore_errors=True)
    writer = orders.write.option("header", True) if fmt == "csv" else orders.write
    start = time.perf_counter()
    writer.format(fmt).save(path)
    write_s = time.perf_counter() - start
    reader = spark.read.format(fmt)
    if fmt in ("csv", "json"):
        reader = reader.option("header", True).schema(orders.schema)
    start = time.perf_counter()
    reader.load(path).agg(F.sum("amount")).collect()
    read_s = time.perf_counter() - start
    sizes[fmt] = folder_mb(path)
    print(f"{fmt:8} {sizes[fmt]:7.1f} MB  write {write_s:4.1f}s  sum(amount) {read_s:4.2f}s")
assert max(sizes, key=sizes.get) == "json"
assert sizes["parquet"] < sizes["csv"] and sizes["orc"] < sizes["csv"]

# --- Exercise 2: datasource.py's layouts on orders -----------------------------
# (a) partitionBy, then partition pruning plus pushdown in one scan.
shutil.rmtree("layout/by_date", ignore_errors=True)
orders.write.partitionBy("order_date").parquet("layout/by_date")
folders = [d for d in os.listdir("layout/by_date") if d.startswith("order_date=")]
q = spark.read.parquet("layout/by_date").filter(
    (F.col("order_date") == "2026-01-05") & (F.col("amount") > 99)
)
plan = plan_text(q)
print("folders:", len(folders))
print(re.findall(r"PartitionFilters: \[[^\]]*\]", plan)[0])
print(re.findall(r"PushedFilters: \[[^\]]*\]", plan)[0])
assert len(folders) == 30 and "2026-01-05" in plan and "GreaterThan(amount,99.0)" in plan

# (b) schema merging, like parquet_schema_merging_example: two batches, one
#     with an extra column, written under key=value folders.
shutil.rmtree("layout/batches", ignore_errors=True)
orders.limit(1000).write.parquet("layout/batches/batch=1")
orders.limit(1000).withColumn("discount", F.lit(0.1)).write.parquet("layout/batches/batch=2")
merged = spark.read.option("mergeSchema", "true").parquet("layout/batches")
merged.groupBy("batch").agg(F.count("*").alias("rows"), F.count("discount").alias("with_discount")).show()
assert {"batch", "discount"} <= set(merged.columns)
assert merged.filter("batch = 1 AND discount IS NOT NULL").count() == 0
print("day04: all checks passed")
