"""A deliberately slow, messy job for the Day 8 refactor lab.

Run it a few times as is and note the median time. Then copy it to good_job.py
and fix one problem at a time, saving the plan and the runtime after each fix.
Every numbered comment below is a habit from the Day 8 checklist; do not copy them.
"""
import os
import time

from lab_utils import F, get_spark, make_customers, make_orders, udf

spark = get_spark("bad-job", delta=False, avro=False)

# Day 2 writes these folders; create them here if you skipped that step.
if not os.path.exists("data/orders"):
    make_orders(spark, 5_000_000).write.parquet("data/orders")
    make_customers(spark).write.parquet("data/customers")

start = time.perf_counter()

# 1. Hardcoded paths and business thresholds in the middle of the code.
orders = spark.read.parquet("data/orders")
customers = spark.read.parquet("data/customers")
MIN_AMOUNT = 20.0
VIP_COUNTRIES = ["C1", "C2", "C3"]


# 2. Python UDFs for logic that built-in functions already cover.
@udf("string")
def clean_status(status):
    return status.strip().upper() if status else "UNKNOWN"


@udf("boolean")
def is_big(amount):
    return amount is not None and amount > MIN_AMOUNT


# 3. withColumn(lit(...)) in a loop: one more projection per iteration.
report = orders
for i in range(40):
    report = report.withColumn(f"flag_{i}", F.lit(i))

# 4. A small dimension joined without a broadcast (broadcasting switched off).
spark.conf.set("spark.sql.autoBroadcastJoinThreshold", -1)
report = report.join(customers, "customer_id")

# 5. Filtering late, through a UDF, so nothing is pushed down to the scan.
report = (
    report.withColumn("status", clean_status("status"))
    .filter(is_big("amount"))
    .filter(F.col("country").isin(VIP_COUNTRIES))
)

# 6. coalesce(1) before writing: the whole last stage runs as one task.
report.coalesce(1).write.mode("overwrite").parquet("out/bad_job_report")

print(f"bad job finished in {time.perf_counter() - start:.1f}s")
