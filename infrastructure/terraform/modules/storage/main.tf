# Bucket for raw scraped data
resource "google_storage_bucket" "raw_data" {
  name          = "${var.project_id}-${var.environment}-raw"
  location      = var.region
  force_destroy = true
  
  lifecycle_rule {
    condition {
      age = 30
    }
    action {
      type          = "SetStorageClass"
      storage_class = "NEARLINE"
    }
  }
}

# Bucket for processed data
resource "google_storage_bucket" "processed_data" {
  name          = "${var.project_id}-${var.environment}-processed"
  location      = var.region
  force_destroy = true
}