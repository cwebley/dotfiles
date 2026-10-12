# Shared agent skills

This package stores the shared skills previously installed only in `~/.agents/skills/`. Stow keeps that home path unchanged so Pi and other compatible tools discover the same files.

```sh
cd ~/dotfiles
./setup.sh agent-skills
```

- `.agents/skills/`: 37 skill directories and their supporting files.
- `.agents/.skill-lock.json`: existing upstream source metadata, also used by the Pi skill-toggle helper.

Pi-specific web-debug remains in `pi/.pi/agent/skills/`. Pi settings control which shared skills are advertised; the existing exclusions are unchanged. `pi-skills matt on|off|status` operates on the shared source group and deliberately keeps research enabled.

Keep credentials, machine-local skill backups and generated files outside this package. An upstream skill installer can replace Stow links with local files; compare updated content with repository sources before restowing. The existing lock records mattpocock/skills sources; `UPSTREAM-LICENSE` preserves its upstream MIT license. Local/custom overrides may not exactly match lock entries, so keep their original attribution and review provenance when updating.
