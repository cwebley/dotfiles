# Load private environment variables for interactive and non-interactive zsh.
# Keep credentials outside the dotfiles repository in a mode-600 file.
[[ -r "$HOME/.zsh_secrets" ]] && source "$HOME/.zsh_secrets"
