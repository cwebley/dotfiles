# Dotfiles

Collection of config files that expect to be managed by stow.
Ideally this is cloned in $HOME, but stow commands can be updated to us --target if these files are located somewhere else.

```bash
cd ~/dotfiles
stow --restow nvim
stow --restow lvim
stow --restow misc
stow --restow zsh
show --restow tmux

```

The --restow parameter tells stow to unstow the packages first before stowing them again, which is useful for pruning obsolete symlinks from the target directory.

