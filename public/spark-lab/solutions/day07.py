"""Day 7 exercises: cache the right thing, and cut a long lineage.

Reference solution. Needs data/orders and data/customers from the Day 2 lab.
Run it next to lab_utils.py: python day07.py
"""
import glob
import json
import time
import urllib.request

from lab_utils import F, StorageLevel, get_spark, plan_text

spark = get_spark("day07", delta=False, avro=False)
sc = spark.sparkContext
orders = spark.read.parquet("data/orders")
customers = spark.read.parquet("data/customers")


def three_reports(df):
    """Three different actions on the same expensive DataFrame."""
    start = time.perf_counter()
    df.groupBy("country").count().collect()
    df.groupBy("segment").agg(F.sum("amount")).collect()
    df.groupBy("status").agg(F.avg("amount")).collect()
    return time.perf_counter() - start


def storage_tab():
    url = f"{sc.uiWebUrl}/api/v1/applications/{sc.applicationId}/storage/rdd"
    return [(r["storageLevel"], r["numCachedPartitions"], r["numPartitions"],
             round(r["memoryUsed"] / 2**20), round(r["diskUsed"] / 2**20))
            for r in json.load(urllib.request.urlopen(url))]


# --- Exercise 1: cache the right thing ---------------------------------------
joined = orders.join(customers, "customer_id")
print(f"no persistence: {three_reports(joined):.2f}s")

joined.cache()
print(f"cache(), first run fills it: {three_reports(joined):.2f}s")
print(f"cache(), second run: {three_reports(joined):.2f}s")
print("storage level:", joined.storageLevel, "| Storage tab (level, cached, total, MiB mem, MiB disk):", storage_tab())
assert "InMemoryTableScan" in plan_text(joined.groupBy("country").count())
joined.unpersist(blocking=True)
assert storage_tab() == []

joined.persist(StorageLevel.DISK_ONLY)
three_reports(joined)
print(f"DISK_ONLY, second run: {three_reports(joined):.2f}s | Storage tab: {storage_tab()}")
joined.unpersist(blocking=True)

# --- Exercise 2: cut a long lineage -------------------------------------------
sc.setCheckpointDir("checkpoints")
df = spark.range(1000)
for i in range(30):
    df = df.withColumn(f"c{i}", F.col("id") + i)
before = len(plan_text(df, "extended"))
reliable = df.checkpoint()        # writes to checkpoints/, survives executor loss
local = df.localCheckpoint()      # executor storage only, fast but not fault tolerant
print(f"plan length: {before} before, {len(plan_text(reliable, 'extended'))} after checkpoint, "
      f"{len(plan_text(local, 'extended'))} after localCheckpoint")
print("root of the checkpointed plan:", plan_text(reliable, "simple").splitlines()[1][:50])
assert len(plan_text(reliable, "extended")) < before / 3
assert glob.glob("checkpoints/**/part-*", recursive=True)
print("day07: all checks passed")
