# Service Account for Scraper
resource "google_service_account" "scraper" {
  account_id   = "${var.environment}-scraper-sa"
  display_name = "Scraper Service Account"
}

# Service Account for API
resource "google_service_account" "api" {
  account_id   = "${var.environment}-api-sa"
  display_name = "API Service Account"
}

# IAM Roles for Scraper
resource "google_project_iam_member" "scraper_storage" {
  project = var.project_id
  role    = "roles/storage.objectAdmin"
  member  = "serviceAccount:${google_service_account.scraper.email}"
}

# IAM Roles for API
resource "google_project_iam_member" "api_sql" {
  project = var.project_id
  role    = "roles/cloudsql.client"
  member  = "serviceAccount:${google_service_account.api.email}"
}