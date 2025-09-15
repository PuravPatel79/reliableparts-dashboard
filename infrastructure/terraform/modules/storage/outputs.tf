output "raw_data_bucket" {
  value = google_storage_bucket.raw_data.name
}

output "processed_data_bucket" {
  value = google_storage_bucket.processed_data.name
}