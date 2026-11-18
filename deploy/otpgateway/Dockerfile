# Pinned digest of knadh/otpgateway (Never deploy with :latest)
# Verified upstream binary digest for linux/amd64
FROM ghcr.io/knadh/otpgateway:v0.3.0@sha256:7b5d1e2e9c12b7a70821b22e1b1d034989063eb778ecff9d0124c96d9dc86976

WORKDIR /app

# Copy production/staging configuration
COPY config.toml /app/config.toml

# Expose HTTP port for Cloud Run sidecar / internal VPC
EXPOSE 9000

# Healthcheck endpoint
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD ["/app/otpgateway", "--health"] || exit 1

ENTRYPOINT ["/app/otpgateway", "--config", "/app/config.toml"]
