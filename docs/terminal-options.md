# Terminal alternatives for the new Mac

Requirements: fast rendering, ligatures, inline images, simple configuration; retain tmux for sessions and panes. No terminal choice has been made or tested on the new Mac in this comparison.

## Shortlist

- Ghostty: native macOS UI, Metal rendering, ligatures, Kitty graphics protocol, and plain configuration. Best initial recommendation for a Mac-focused minimal setup. This is a workflow judgment, not a benchmark result.
- kitty: GPU rendering, ligatures, mature graphics protocol and image tools. Its optional tabs, panes and kittens need not be used. Suitable if its image tooling is the priority.
- WezTerm: supports ligatures, Kitty/iTerm2/Sixel graphics, Lua configuration and extensive local/remote multiplexing. Capable, but its extra configuration and mux features are not priorities for this user.

Images through tmux are a separate compatibility issue. Kitty's FAQ explicitly warns that images depend on application support for mechanisms such as Unicode placeholders, and other features can depend on tmux version. Do not promise images in every tmux pane simply because the outer terminal supports images. Test the actual image-producing application inside and outside tmux. Ligatures require a font containing them.

Homebrew's inspected Ghostty and kitty casks are not marked disabled, unlike Alacritty's cask. This is not a guarantee of successful company-Mac installation or permission approval.

## Rex by Superlogical

Rex is a terminal application built around a persistent client/server multiplexer, not simply another renderer. Superlogical's own homepage places terminal multiplexing at the center of the product. Its team includes Ghostty creator Mitchell Hashimoto. The current installation docs describe beta access via mailing-list invitations and a Discord-authenticated tester download. The announcement says the clients and servers will be free, self-hostable and usable without an account; distinguish that intended runtime model from today's gated download process.

The macOS settings reference explicitly documents ligatures. No image-protocol or tmux-compatibility claim was verified in this check. No performance benchmark or new-Mac test was performed. For a user retaining tmux and wanting a minimal terminal, Ghostty or kitty remains the closer fit. Rex is worth evaluating if replacing tmux becomes a goal; that is a recommendation, not evidence it cannot run tmux.

Sources:
- https://www.superlogical.com/
- https://www.superlogical.com/updates/public-testing-beginning
- https://www.superlogical.com/rex/docs/installation
- https://www.superlogical.com/rex/docs/reference/mac-settings

## Primary sources

- https://ghostty.org/docs/about
- https://ghostty.org/docs/features
- https://sw.kovidgoyal.net/kitty/
- https://sw.kovidgoyal.net/kitty/faq/#i-am-using-tmux-zellij-and-have-a-problem
- https://wezterm.org/features.html
- https://github.com/Homebrew/homebrew-cask/blob/master/Casks/g/ghostty.rb
- https://github.com/Homebrew/homebrew-cask/blob/master/Casks/k/kitty.rb

No reliable usage ranking was gathered. This is a feature comparison, not a popularity survey or performance benchmark.
