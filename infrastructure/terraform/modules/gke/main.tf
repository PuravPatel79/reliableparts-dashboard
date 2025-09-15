# GKE Cluster using Autopilot mode for simplicity
resource "google_container_cluster" "primary" {
  name     = "${var.project_id}-${var.environment}-gke"
  location = var.region
  
  # Autopilot mode - Google manages everything
  enable_autopilot = true
  
  network    = var.network_name
  subnetwork = var.subnet_name
  
  ip_allocation_policy {
    cluster_secondary_range_name  = "pods"
    services_secondary_range_name = "services"
  }
  
  master_auth {
    client_certificate_config {
      issue_client_certificate = false
    }
  }
}