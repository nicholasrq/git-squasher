This is JS cli with no dependencies to squash many commits to a single one.

It uses `git` commands and GitHub API to get all the necessary information to
provide safe way of squashing commits.

Squashy uses last commit on your default branch (master in most cases) to reset
HEAD, then it adds all the files to staged area, commits them and forcely pushes
it to origin.

You can provide Squasher different commit or branch if you'd like, the tool will
ask you for that.

Also it will ensure that your branch is up-to-date and has no uncommited
changes. If it detects that your branch is outdated, script will just stop and
ask you to commit changes and/or pull data from origin.

Squasher uses PR title as default commit message, if no PR exists, then you'll
have to provide commit message manually. Default commit message can be overriden.
