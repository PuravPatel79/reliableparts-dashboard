output "gke_cluster_name" {
  value = module.gke.cluster_name
}

output "database_connection" {
  value = module.database.connection_name
}

output "buckets" {
  value = {
    raw_data  = module.storage.raw_data_bucket
    processed = module.storage.processed_data_bucket
  }
}