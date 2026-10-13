#!/usr/bin/env bash
# Run INSIDE Ubuntu (WSL) from the project folder:  bash scripts/wsl-setup.sh
# Installs Java 17, Maven and MySQL, creates the database, writes config.properties and starts ParkSmart on http://localhost:8080
set -e
sudo apt update
sudo apt install -y openjdk-17-jdk maven mysql-server
sudo service mysql start
DBPW=$(openssl rand -hex 12)
sudo mysql -e "CREATE DATABASE IF NOT EXISTS parksmart CHARACTER SET utf8mb4; CREATE USER IF NOT EXISTS 'parksmart'@'localhost' IDENTIFIED BY '$DBPW'; ALTER USER 'parksmart'@'localhost' IDENTIFIED BY '$DBPW'; GRANT ALL ON parksmart.* TO 'parksmart'@'localhost'; FLUSH PRIVILEGES;"
cp -n config.example.properties config.properties
sed -i "s|^db.password=.*|db.password=$DBPW|; s|^tls=.*|tls=false|; s|^port=.*|port=8080|" config.properties
echo "Starting ParkSmart. Note the admin password printed below (shown once). Open http://localhost:8080 in Windows."
mvn -q compile exec:java
