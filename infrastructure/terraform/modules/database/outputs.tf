output "connection_name" {
  value = google_sql_database_instance.postgres.connection_name
}

output "database_name" {
  value = google_sql_database.main.name
}

output "password_secret_id" {
  value = google_secret_manager_secret.db_password.secret_id
}