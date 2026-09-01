#!/bin/bash
# shellcheck source=.env
set -e

[ -e ".env" ] && source .env

IMAGE_NAME="s19y-mcp"
REGISTRY="${DOCKER_REGISTRY:-docker.io}"
NAMESPACE="${DOCKER_NAMESPACE:-$USER}"
TAG="${DOCKER_TAG:-latest}"
PLATFORMS="${DOCKER_PLATFORMS:-linux/amd64,linux/arm64}"

FULL_IMAGE="${REGISTRY}/${NAMESPACE}/${IMAGE_NAME}:${TAG}"

echo "Building multi-arch image: ${FULL_IMAGE}"
echo "Platforms: ${PLATFORMS}"

# Create/use buildx builder
docker buildx create --name multiarch --driver docker-container --use 2>/dev/null || true
docker buildx inspect --bootstrap > /dev/null 2>&1

# Build and push
docker buildx build \
  --platform "${PLATFORMS}" \
  -t "${FULL_IMAGE}" \
  --push \
  .

echo "Done! Pushed: ${FULL_IMAGE}"
