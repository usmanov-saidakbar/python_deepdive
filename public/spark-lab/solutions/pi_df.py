"""Day 1, exercise 2: the official pi.py example, ported to the DataFrame API.

Reference solution. Usage (from the folder that holds this file):
    spark-submit --master "local[4]" pi_df.py 10          # 10 partitions
    spark-submit --master "local[4]" pi_df.py 10 --wait   # keep the UI open
"""
import sys

from pyspark.sql import SparkSession, functions as F

if __name__ == "__main__":
    spark = SparkSession.builder.appName("PythonPiDataFrame").getOrCreate()

    partitions = int(sys.argv[1]) if len(sys.argv) > 1 and sys.argv[1].isdigit() else 2
    n = 100_000 * partitions

    points = spark.range(0, n, numPartitions=partitions).select(
        (F.rand(seed=42) * 2 - 1).alias("x"),
        (F.rand(seed=7) * 2 - 1).alias("y"),
    )
    inside = points.select(
        F.sum(F.when(F.col("x") ** 2 + F.col("y") ** 2 <= 1, 1).otherwise(0)).alias("inside")
    ).first()["inside"]
    print("Pi is roughly %f" % (4.0 * inside / n))

    if "--wait" in sys.argv:
        input("Spark UI is still up at %s. Press Enter to stop." % spark.sparkContext.uiWebUrl)
    spark.stop()
