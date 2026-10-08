#!/usr/bin/env bash
# Local Kubernetes on kind: builds all 8 images, loads them, applies k8s/.
# Apps: http://{kestrel,boli,onboard,margin}.localtest.me:8080  (needs ~6 GB free disk)
set -euo pipefail
cd "$(dirname "$0")/.."
CLUSTER=megathon

if ! kind get clusters | grep -qx "$CLUSTER"; then
  kind create cluster --config k8s/kind-config.yaml
  kubectl apply -f https://kind.sigs.k8s.io/examples/ingress/deploy-ingress-nginx.yaml
fi
kubectl config use-context "kind-$CLUSTER"

for a in kestrel boli onboard margin; do docker build -t "megathon-$a:dev" -f docker/web.Dockerfile --build-arg APP=$a .; done
for s in llm risk bhashini; do docker build -t "megathon-$s:dev" -f docker/python.Dockerfile --build-arg SERVICE=$s .; done
docker build -t megathon-collab:dev -f docker/collab.Dockerfile .
kind load docker-image --name "$CLUSTER" megathon-{kestrel,boli,onboard,margin,llm,risk,bhashini,collab}:dev

grep -v '^#' .env > k8s/.env.secret
kubectl wait -n ingress-nginx --for=condition=ready pod -l app.kubernetes.io/component=controller --timeout=180s
kubectl delete job -n megathon migrate --ignore-not-found
kubectl apply -k k8s
kubectl rollout restart -n megathon deploy
kubectl rollout status -n megathon deploy/kestrel --timeout=300s
echo "Ready: http://kestrel.localtest.me:8080 (also boli, onboard, margin)"
