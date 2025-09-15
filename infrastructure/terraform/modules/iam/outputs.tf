output "service_accounts" {
  value = {
    scraper = google_service_account.scraper.email
    api     = google_service_account.api.email
  }
}