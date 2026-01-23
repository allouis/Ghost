{
  description = "Ghost development environment";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs = { self, nixpkgs, flake-utils }:
    flake-utils.lib.eachDefaultSystem (system:
      let
        pkgs = import nixpkgs {
          inherit system;
          config.allowUnfree = true;
        };
      in
      {
        devShells.default = pkgs.mkShell {
          buildInputs = with pkgs; [
            nodejs_22
            yarn
          ];

          shellHook = ''
            echo "Ghost development environment loaded"
            echo "Node.js: $(node --version)"
            echo "Yarn: $(yarn --version)"
            echo ""
            if ! command -v docker &> /dev/null; then
              echo "⚠️  Docker not found - install Docker Desktop or docker-ce"
              echo ""
            fi
            echo "Quick start:"
            echo "  yarn setup       # First-time setup"
            echo "  yarn dev:forward # Docker-based development"
            echo ""
          '';
        };
      }
    );
}
