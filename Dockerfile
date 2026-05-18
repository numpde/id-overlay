FROM node:22-bookworm-slim@sha256:689c11043dad91472750cd824c97dd5e2318e9dd6f954e492fe7af0135d33ceb AS id_overlay_base

RUN apt-get update \
  && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
    ca-certificates \
    zip \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /work

CMD ["bash"]

FROM id_overlay_base AS id_overlay_install

USER node

CMD ["bash"]

FROM id_overlay_base AS id_overlay_check

RUN rm -f /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack \
  && rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack /root/.npm /tmp/*

USER node

CMD ["bash"]
