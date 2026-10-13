FROM maven:3.9-eclipse-temurin-17 AS build
WORKDIR /app
COPY pom.xml .
RUN mvn -q -B dependency:go-offline
COPY src src
RUN mvn -q -B package -DskipTests dependency:copy-dependencies -DoutputDirectory=target/lib

FROM eclipse-temurin:17-jre
WORKDIR /app
RUN useradd -r -u 10001 parksmart && mkdir -p backups && chown parksmart backups
COPY --from=build /app/target/classes classes
COPY --from=build /app/target/lib lib
COPY web web
USER parksmart
ENV PORT=8080 TLS=false
EXPOSE 8080
CMD ["java","-cp","classes:lib/*","parking.ParkSmartServer"]
