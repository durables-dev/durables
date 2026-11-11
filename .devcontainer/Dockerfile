FROM mcr.microsoft.com/devcontainers/typescript-node:24-bookworm

# Terraform from HashiCorp's release, verified against HashiCorp's release-signing key. The key
# comes over HTTPS from hashicorp.com rather than a public keyserver, and must match the pinned
# fingerprint, which is the one keybase.io/hashicorp publishes.
ARG TERRAFORM_VERSION=1.15.8
ARG HASHICORP_KEY_FINGERPRINT=C874011F0AB405110D02105534365D9472D7468F

RUN set -eux; \
    arch="$(dpkg --print-architecture)"; \
    release="terraform_${TERRAFORM_VERSION}"; \
    base="https://releases.hashicorp.com/terraform/${TERRAFORM_VERSION}"; \
    work="$(mktemp -d)"; \
    cd "$work"; \
    export GNUPGHOME="$work/gnupg"; \
    mkdir -m 700 "$GNUPGHOME"; \
    curl -fsSL -o hashicorp.asc https://www.hashicorp.com/.well-known/pgp-key.txt; \
    gpg --batch --import hashicorp.asc; \
    gpg --batch --with-colons --fingerprint | grep -q "^fpr:::::::::${HASHICORP_KEY_FINGERPRINT}:"; \
    curl -fsSLO "$base/${release}_SHA256SUMS"; \
    curl -fsSLO "$base/${release}_SHA256SUMS.sig"; \
    curl -fsSLO "$base/${release}_linux_${arch}.zip"; \
    gpg --batch --verify "${release}_SHA256SUMS.sig" "${release}_SHA256SUMS"; \
    grep " ${release}_linux_${arch}.zip\$" "${release}_SHA256SUMS" | sha256sum -c -; \
    unzip -q "${release}_linux_${arch}.zip" terraform -d /usr/local/bin; \
    cd /; \
    rm -rf "$work"; \
    terraform version
