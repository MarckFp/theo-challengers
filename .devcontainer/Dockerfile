FROM mcr.microsoft.com/devcontainers/base:ubuntu-24.04

ARG DEBIAN_FRONTEND=noninteractive
ARG USERNAME=vscode

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    curl \
    ca-certificates \
    pkg-config \
    libssl-dev \
    libgtk-3-dev \
    libayatana-appindicator3-dev \
    librsvg2-dev \
    libwebkit2gtk-4.1-dev \
    libsoup-3.0-dev \
    patchelf \
    xdg-utils \
    xvfb \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

USER ${USERNAME}

RUN curl -fsSL https://bun.sh/install | bash
RUN curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y

ENV PATH="/home/${USERNAME}/.bun/bin:/home/${USERNAME}/.cargo/bin:${PATH}"
ENV BUN_INSTALL_CACHE_DIR="/tmp/.bun-install-cache"

RUN rustup target add x86_64-unknown-linux-gnu
