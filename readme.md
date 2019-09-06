# Squasher

This is JS cli tool to squash many commits to a single one.

## Installation

```
npm install -g git-squasher
```

or

```
yarn global add git-squasher
```

## Usage

Squasher provides cli command that you can run inside of your repos.

```
git-squash
```

## Using with private repos

In order to be able to use this tool with private repo you need to provide a PAT (Personal Access Token). Create a new token first using [this guide](https://help.github.com/en/articles/creating-a-personal-access-token-for-the-command-line), then navigate to your local repo using terminal and ad newly created token to a local config file using command:

```
git config user.pat [paste your token here] --local
```

## About

Squasher uses `git` commands and GitHub API to get all the necessary information
to provide the safest way of squashing commits.

Squashy uses last commit on your default branch (master in most cases) to reset
HEAD, then it adds all the files to staged area, commits them and forcibly pushes
it to origin.

You can provide Squasher different commit or branch if you'd like, the tool will
ask you for that.

Also it will ensure that your branch is up-to-date and has no uncommitted
changes. If it detects that your branch is outdated, script will just stop and
ask you to commit changes and/or pull data from origin.

Squasher uses PR title as default commit message, if no PR exists, then you'll
have to provide commit message manually. Default commit message can be overridden.

## What squasher does

### Preparation

There are few steps that Squasher does before squashing:

1. Detects repo remote, owner username and repo name
2. Detects default branch (it's `master` in most cases)
3. Detects if there's a pull request using GitHub API (works both for personal and enterprise accounts)
4. Detects latest commit on default branch (hash and commit message)
4. Squasher will also check if you have uncommitted changes or your current working tree is below other changes

**Squasher will stop immediately if your branch is outdated or has uncommitted changed**

### Squash info

After all the preparation it will ask you few simple questions to provide smooth squash.

1. It will show you all the information it has: username and repo name, branch name, repo title (if any)
2. It will prompt you that is uses default branch and will offer you to change any other if necessary. You can provide commit hash, branch name or short hash (first 7 characters from commit hash). You you're providing branch name, then Squasher will try to get latest commit on it.
3. After that Squasher will show all the changes since selected commit and will ask you to confirm that it's OK. You need to explicitly confirm it, otherwise Squasher will stop.
4. Squasher will ask you for commit message. It will use PR title if it exists as a default commit message. If there's no PR for the branch, then you'll have to type commit message manually

### Squashing process

Now Squasher is able to squash all of your commits into single commit that will contain all the changes. This process looks like this:

- `%commit_hash%` – hash to reset branch (typically – latest commit from `master`)
- `%commit_message%` – PR title or custom commit message
- `%branch_name%` – current branch name

```bash
# First Suqasher will pull changes from the server
git pull
# Now we reset branch to desired commit
git reset %commit_hash%
# Stage all changed
git add . -A
# Commit changes with default message or with one provided by user
git commit -m "%commit_message%"
# Forcibly push to origin
git push -f origin %branch_name%
```

If anything bad happened during squashing – Squasher will reset your branch to previous state using `git reflog` – it will look up point in history when reset to `%commit_hash%` occurred and will reset branch to one step before it.

# Restrictions

* Squasher will stop if you're on default branch
* Squasher will stop if there are no changes since last `%commit_hash%`
