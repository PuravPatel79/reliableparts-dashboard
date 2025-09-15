# VPC Network
resource "google_compute_network" "vpc" {
  name                    = "${var.project_id}-${var.environment}-vpc"
  auto_create_subnetworks = false
  routing_mode            = "REGIONAL"
}

# Subnet with proper IP ranges
resource "google_compute_subnetwork" "main" {
  name          = "${var.project_id}-${var.environment}-subnet"
  region        = var.region
  network       = google_compute_network.vpc.id
  ip_cidr_range = "10.0.0.0/20"  # 4,096 IPs for nodes
  
  secondary_ip_range {
    range_name    = "pods"
    ip_cidr_range = "172.16.0.0/14"  # 262,144 IPs for pods
  }
  
  secondary_ip_range {
    range_name    = "services"
    ip_cidr_range = "172.20.0.0/16"  # 65,536 IPs for services
  }
  
  private_ip_google_access = true
}

# Cloud Router for NAT
resource "google_compute_router" "router" {
  name    = "${var.project_id}-${var.environment}-router"
  region  = var.region
  network = google_compute_network.vpc.id
}

# Cloud NAT for outbound internet access
resource "google_compute_router_nat" "nat" {
  name                               = "${var.project_id}-${var.environment}-nat"
  router                             = google_compute_router.router.name
  region                             = var.region
  nat_ip_allocate_option            = "AUTO_ONLY"
  source_subnetwork_ip_ranges_to_nat = "ALL_SUBNETWORKS_ALL_IP_RANGES"
}

# Firewall rule for internal communication
resource "google_compute_firewall" "internal" {
  name    = "${var.project_id}-${var.environment}-allow-internal"
  network = google_compute_network.vpc.name
  
  allow {
    protocol = "tcp"
  }
  
  allow {
    protocol = "udp"
  }
  
  allow {
    protocol = "icmp"
  }
  
  source_ranges = ["10.0.0.0/8", "172.16.0.0/12"]
}

# Private Service Connection for Google Services
resource "google_compute_global_address" "private_ip" {
  name          = "${var.project_id}-${var.environment}-private-ip"
  purpose       = "VPC_PEERING"
  address_type  = "INTERNAL"
  prefix_length = 16
  network       = google_compute_network.vpc.id
}

resource "google_service_networking_connection" "private_vpc" {
  network                 = google_compute_network.vpc.id
  service                 = "servicenetworking.googleapis.com"
  reserved_peering_ranges = [google_compute_global_address.private_ip.name]
}