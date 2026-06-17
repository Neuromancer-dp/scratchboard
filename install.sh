#!/bin/bash

echo ""
echo "  installing scratchboard..."
echo ""

# check node
if ! command -v node &> /dev/null; then
  echo "  node.js not found. install it from https://nodejs.org and try again."
  exit 1
fi

# check ollama
if ! command -v ollama &> /dev/null; then
  echo "  ollama not found. install it from https://ollama.com and try again."
  exit 1
fi

# clone
INSTALL_DIR="$HOME/scratchboard"
git clone https://github.com/YOUR_USERNAME/scratchboard "$INSTALL_DIR"
cd "$INSTALL_DIR"
npm install

# alias
SHELL_RC="$HOME/.bashrc"
if [ -f "$HOME/.zshrc" ]; then
  SHELL_RC="$HOME/.zshrc"
fi

echo "" >> "$SHELL_RC"
echo "# scratchboard" >> "$SHELL_RC"
echo "alias scratchboard=\"cd $INSTALL_DIR && node server.js & sleep 2 && xdg-open http://localhost:3747\"" >> "$SHELL_RC"
source "$SHELL_RC" 2>/dev/null || true

echo ""
echo "  done. type 'scratchboard' to launch."
echo "  make sure ollama is running first: ollama serve"
echo ""
