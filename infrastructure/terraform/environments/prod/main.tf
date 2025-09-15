# Provider Configuration
provider "google" {
  project = var.project_id
  region  = var.region
}

provider "google-beta" {
  project = var.project_id
  region  = var.region
}

# Enable APIs
resource "google_project_service" "apis" {
  for_each = toset([
    "compute.googleapis.com",
    "container.googleapis.com",
    "sqladmin.googleapis.com",
    "storage.googleapis.com",
    "secretmanager.googleapis.com",
    "servicenetworking.googleapis.com",
    "iam.googleapis.com"
  ])
  
  service            = each.value
  disable_on_destroy = false
}

# Wait for APIs to be enabled
resource "time_sleep" "wait_for_apis" {
  depends_on = [google_project_service.apis]
  create_duration = "30s"
}

# Networking
module "networking" {
  source = "../../modules/networking"
  
  project_id  = var.project_id
  region      = var.region
  environment = var.environment
  
  depends_on = [time_sleep.wait_for_apis]
}

# GKE Cluster
module "gke" {
  source = "../../modules/gke"
  
  project_id   = var.project_id
  region       = var.region
  environment  = var.environment
  network_name = module.networking.vpc_name
  subnet_name  = module.networking.subnet_name
  
  depends_on = [module.networking]
}

# Database
module "database" {
  source = "../../modules/database"
  
  project_id  = var.project_id
  region      = var.region
  environment = var.environment
  network_id  = module.networking.vpc_id
  
  depends_on = [module.networking]
}

# Storage
module "storage" {
  source = "../../modules/storage"
  
  project_id  = var.project_id
  region      = var.region
  environment = var.environment
  
  depends_on = [time_sleep.wait_for_apis]
}

# IAM
module "iam" {
  source = "../../modules/iam"
  
  project_id     = var.project_id
  project_number = var.project_number
  environment    = var.environment
  
  depends_on = [time_sleep.wait_for_apis]
}