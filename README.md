# ParkSmart v3 - Java + MySQL parking system with motion-capture plate reading

Features: live slot map, shared MySQL data, logins (admin/attendant), audit log, watchlist, reports, CSV backup,
camera gate (motion trigger -> sharpest frames -> OCR vote -> vehicle type -> auto-entry with 3 s cancel), photo upload, manual entry.
OCR and vehicle-detection engines are bundled in web/vendor (work offline).

## Windows 11 Home with WSL + Ubuntu (recommended for your laptop)
Open the Ubuntu app, go to the unzipped folder (Windows drives are under /mnt/c/...), then run ONE command:
    bash scripts/wsl-setup.sh
It installs Java, Maven and MySQL, creates the database, writes config.properties and starts the server.
The first start prints the admin password ONCE. Open http://localhost:8080 in your normal Windows browser (the camera works on localhost).
Next time:  sudo service mysql start   then   mvn -q compile exec:java   (inside the project folder).
Phone on the same Wi-Fi: set tls=true and port=8443 in config.properties, find your Windows IP (ipconfig), run in PowerShell (admin):
    netsh interface portproxy add v4tov4 listenport=8443 listenaddress=0.0.0.0 connectport=8443 connectaddress=<output of: wsl hostname -I>
    netsh advfirewall firewall add rule name="ParkSmart" dir=in action=allow protocol=TCP localport=8443
then open https://<Windows IP>:8443 on the phone and accept the certificate warning once (the WSL address changes after a reboot).

## Docker (alternative)
Docker does not replace the SQL database: it only packages MySQL + the server so one command starts both (no Java/Maven/MySQL installs).
    copy .env.example .env      (set the passwords)
    docker compose up -d --build
    docker compose logs app     (shows the one-time admin password)
Works on Windows 11 Home through Docker Desktop's WSL2 backend. Use it for servers; for your laptop the WSL script above is lighter.

## Maven + MySQL by hand
1. In MySQL:  CREATE DATABASE parksmart CHARACTER SET utf8mb4;
              CREATE USER 'parksmart'@'localhost' IDENTIFIED BY 'your-db-password';
              GRANT ALL ON parksmart.* TO 'parksmart'@'localhost';
2. cp config.example.properties config.properties   and set db.password
3. mvn compile exec:java
It prints the addresses and the random admin password (shown once). tls=true makes an https address with a self-signed certificate;
open the "phone" address on the same Wi-Fi and accept the warning once so the phone camera is allowed.

## Windows quick demo (no Docker, no database)
1. Install Python from python.org (tick "Add Python to PATH").
2. Double-click START-DEMO.bat. It opens http://localhost:8000 .
3. Open Check-in > Camera scan or Upload photo, then press "Test plate reader". It should say "Plate reader OK".
Do NOT double-click web/index.html: browsers block the plate reader for pages opened as files.

## If plate reading says it is unavailable
- "Page opened as a file ..."            -> open it through http://localhost (START-DEMO.bat), a web host, or the Java server
- "Plate reader files not found ..."     -> keep the whole web folder together (index.html, app.js, vendor/)
- "Camera needs https:// or localhost"   -> on a phone use the https:// address the server prints, or a host with HTTPS
- "Plate reader could not start (...)"   -> send me that text

## Using the camera gate
Sign in > Check-in > Camera scan > Start camera. Wait for "Ready". Keep "Motion capture" and "Auto-entry" on.
For fast vehicles the CAMERA matters more than the software:
- aim across the lane so the plate crosses the frame's middle band; fill that band with the plate (zoom in)
- shutter 1/1000 s or faster (the app requests it if the phone allows; otherwise use a camera/app with manual exposure)
- good light or an IR lamp; fixed focus on the lane; 60 fps if available
Auto-entry needs >=2 frames agreeing (or >=85% confidence) AND a detected vehicle type; otherwise it asks the operator to tap "Park now".
Plates are checked against the Indian format and state codes. Add stolen/suspect plates in Admin > Watchlist: they are refused and logged.

## Hosting
- GitHub Pages (free, HTTPS): the repo includes .github/workflows/pages.yml which publishes web/ as a DEMO (data stays in each browser).
  Repo Settings > Pages > Source: GitHub Actions. Camera, plate reading and vehicle detection all work there.
- Real shared system: Docker on a VPS (Oracle Cloud free tier, DigitalOcean, Hetzner) or Render/Railway + managed MySQL, behind HTTPS (Caddy profile above).
- NEVER commit config.properties, .env or *.p12 (already in .gitignore).

## Security
Passwords PBKDF2-SHA256, prepared statements, role checks, lockout, audit log, strict CSP, TLS 1.2+. See SECURITY_TESTS.md.
Run the test suite: python3 tests/security_test.py http://localhost:8080 admin <password>
Before exposing to the internet: put a reverse proxy in front, change default passwords, keep MySQL private, back up regularly
(Admin > Staff & backup writes CSV to backups/; also mysqldump parksmart > backup.sql).

## Other
- Console version: mvn compile exec:java -Dexec.mainClass=parking.ParkingApp
- optional/Tess4JPlateReader.java: desktop webcam reader for the console app (untested, needs tess4j + webcam-capture)

## Settings (Check-in > Gate settings)
- Country: "All known formats" reads about 45 plate templates (India, UK, USA, Canada, Germany, France, Italy, Spain, Portugal, Netherlands, Belgium, Ireland,
  Switzerland, Sweden, Poland, Turkey, Russia, UAE, Saudi Arabia, Pakistan, Sri Lanka, Malaysia, Singapore, Indonesia, Philippines, Vietnam, China (Latin part),
  Australia, New Zealand, South Africa, Nigeria, Kenya, Brazil, Argentina, Mexico) plus a generic mode. Pick one country to cut wrong matches.
  Plates in Arabic, Chinese, Japanese, Korean, Thai or Devanagari script cannot be read (only Latin letters and digits).
- Read distance: "Very near" only reads when the plate text is at least 15% of the frame width (Normal 8%, Far 4%).
- Auto delay (default Instant = no prompt): 0-5 s before auto-park/auto-exit; a delay shows a Cancel button. There is NO confidence threshold: any plate-shaped read is acted on, so wrong reads are possible. Use the delay to cancel,
  and review automatic entries in Admin > Audit log (CHECKIN_AUTO / CHECKOUT_AUTO).
- If type unknown: the vehicle type used when the camera cannot tell (the detector knows car, motorcycle, truck, bus).

## Exit camera (optional)
Expand "Exit camera" on the left, choose the second camera, press Start exit camera. A vehicle whose plate is read is checked out automatically
(fee charged, bay freed). At exit the reader also compares against the plates currently parked, so a 1-2 character misread still matches the right vehicle.
