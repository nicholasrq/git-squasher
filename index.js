#!/usr/bin/env node
const childProcess = require('child_process')
const https = require('https')
const URL = require('url')

const out = (message = '') => {
  console.log(message.trim().split('\n').map(r => r.trim()).join('\n'))
}

const exec = (cmd, callback) => {
  if (cmd instanceof Function) {
    const result = cmd()
    if (callback instanceof Function) {
      return callback(result)
    }
    return result
  } else if (callback instanceof Function) {
    let err = ''
    childProcess.exec(cmd, (err, stdout, stderr) => {
      if (err) return err
      stdout = stdout.toString()
      stderr = stderr.toString()

      if (stdout) console.log(stdout)
      if (stderr) console.log(stderr)

      callback(err)
    })
  } else {
    const command = cmd.trim()
    return childProcess.execSync(command).toString().trim()
  }
}

const execChain = (commands) => {
  let promise = Promise.resolve()

  for (let cmd of commands) {
    promise = promise.then(() => {
      return new Promise((resolve, reject) => {
        exec(cmd, (error) => {
          if (error) {
            const err = Error(error)
            return resolve(Promise.reject(err))
          } else {
            return resolve()
          }
        })
      })
    })
  }

  return promise
}

const getOrigin = () => {
  const remote = exec('git config --get remote.origin.url')

  if (/github\./.test(remote)) {
    if (/^http/.test(remote)) {
      const {path, host: hostname} = URL.parse(remote)
      const [username, repo] = path
        .replace(/^([\/]+)|\.git|([\/]+)$/g, '')
        .split('/')
      return {remote, hostname, username, repo}
    } else if (/^([^@]+)@/) {
      const [hostname, params] = remote.replace(/^([^@]+)@/, '').split(':')
      const [username, repo] = params
        .replace(/^([\/]+)|\.git|([\/]+)$/g, '')
        .split('/')
      return {remote, hostname, username, repo}
    }
  }
}

const origin = getOrigin()

const request = (url, redirect=0) => {
  return new Promise((resolve) => {
    if (redirect > 5) return resolve(null)

    const targetURL = URL.parse(url)
    const options = {
      host: targetURL.host,
      path: targetURL.path,
      query: targetURL.query
    }

    const callback = function(response) {
      let str = '';

      //another chunk of data has been recieved, so append it to `str`
      response.on('data', function (chunk) {
        str += chunk;
      });

      //the whole response has been recieved, so we just print it out here
      response.on('end', function () {
        const status = response.statusCode
        const json = (function () {
          try {
            return JSON.parse(str)
          } catch (err) {
            return null
          }
        }(str))

        if (json) {
          if (status === 301 || status === 302) {
            return resolve(request(response.headers.location, redirect++))
          } else if(status === 200) {
            return resolve(json)
          }
        }
        return resolve(null)
      });
    }

    https.request(options, callback).end()
  })
}

const getPR = (branchName, origin) => {
  if (!branchName || !origin) {
    return Promise.resolve(null)
  }
  return new Promise((resolve) => {
    const repo = `${origin.username}/${origin.repo}`
    const apiURL = `https://api.${origin.hostname}/repos/${repo}/pulls`

    request(apiURL).then((response) => {
      if (response && response.length > 0) {
        const pull = false || response.find((p) => {
          return p.head.ref === branchName
        })

        return resolve(pull ? {
          title: pull.title,
          number: pull.number,
          username: pull.user.login
        } : null)
      } else {
        resolve(null)
      }
    })
  })
}

const readline = {
  rl: require('readline').createInterface({
    input: process.stdin,
    output: process.stdout,
    completer (line) {
      if (line.length > 3) {
        const branches = exec(`
          git branch --all | grep ${line}
        `).split('\n').map(bName => {
          return bName.replace(/\* /, '').trim()
        }).filter((bName) => {
          return /^remotes/.test(bName) === false
        })
        return [branches, line]
      } else {
        return [[], line]
      }
    }
  }),
  ask (question, handler) {
    this.rl.question(`${question} `, input => {
      const result = handler(input.trim())
      if (result === false) this.ask(question, handler)
    });
  },
  close () {
    this.rl.close()
  }
}

const getLastCommitHash = (branch) => {
  return exec(
    `git rev-list --first-parent ${branch} 2> /dev/null | head -1`
  )
}

const getCommitMessage = (commitHash) => {
  return exec(
    `git log -1 --pretty=format:%s "${commitHash}" 2> /dev/null | tail -1`
  )
}

const reflogReset = (commitHash) => {
  const commitTest = new RegExp(commitHash)
  const logs = exec('git reflog | head').split('\n')
  const reflog = logs.find((row, i) => {
    const prevRow = logs[i - 1]
    if (prevRow) {
      return /reset:/.test(prevRow) && commitTest.test(prevRow)
    } else {
      return false
    }
  })

  if (reflog) {
    const parts = reflog.match(/^([a-z0-9]{8})\sHEAD@{([0-9]+)}/)
    const command = `git reset HEAD@{${parts[2]}}`
    exec(command)
  }
}

const squash = () => {
  // return
  const branchName = exec(
    `git branch 2> /dev/null | grep \\* | cut -d ' ' -f2`
  )

  const defaultBranch = exec(
    `git remote show ${origin.remote} | grep "HEAD branch" | cut -d ":" -f 2`
  )

  if (branchName === defaultBranch) {
    out("It's not a good idea to squash commits in default branch")
    process.exit()
  }

  out('Welcome to Squashy – the tool to automatically squash your commits')
  out(`Repo   - ${origin.username}/${origin.repo}`)
  out(`Branch - ${branchName}`)

  if (exec('git diff-index HEAD').length > 0) {
    out()
    out('You have uncommitted changes on current branch')
    out('Please, commit them first in order to continue')
    out()
    out(exec('git diff-index HEAD --stat'))
    return readline.close()
  }

  const isUpToDate = !!exec(`git status 2&> /dev/stdout`)
    .match('nothing to commit, working tree clean')

  if (isUpToDate === false) {
    out('Your branch is outdated. Please, update HEAD before squash')
    return readline.close()
  }

  let parentBranchName = defaultBranch
  let commitHash = getLastCommitHash(parentBranchName)
  let commitMessage = getCommitMessage(commitHash)

  getPR(branchName, origin).then((pull) => {

    if (pull) {
      out(`PR     - [#${pull.number}] ${pull.title}`)
    }

    out()
    out(`By default we use latest commit in '${parentBranchName}' to squash`)
    out(`If you'd like, you can use specific commit or branch`)

    readline.ask(`Branch name or commit hash (${parentBranchName}):`, (input) => {
      if (input) {
        const _commitHash = getLastCommitHash(input)
        const _branchName = _commitHash ? input : parentBranchName
        const _commitMessage = getCommitMessage(commitHash || input)

        if (_commitHash && _commitMessage) {
          parentBranchName = _branchName
          commitHash = _commitHash
          commitMessage = _commitMessage
        } else {
          out('Invalid input');
          process.exit(1)
        }
      }

      out()
      out(`Revision to reset to: [${parentBranchName} - ${commitHash.substr(0, 7)}] ${commitMessage}`)

      const changedFiles = exec(`git diff --stat ${commitHash} HEAD | cat`)

      if (changedFiles.length === 0) {
        out('No changes. Nothing to squash')
        process.exit()
      }

      out(`Changes since last commit in ${parentBranchName}`)
      out(changedFiles);

      out()
      readline.ask('Does it look OK? [y/N]', (input) => {
        const answer = (input || 'N').toUpperCase()

        if (answer === 'Y') {
          out()
          out('Now we need commit message')
          if (pull) {
            out(`Default commit message: ${pull.title}`)
          } else {
            out(`As there's no PR for this branch you have to provide commit message`)
          }
          readline.ask('Enter commit message:', (commitMessage) => {
            commitMessage = commitMessage || (pull && pull.title)
            if (!commitMessage) {
              out(`There's no PR for current branch, so we don't have default commit messgae`)
              return false
            }

            execChain([
              () => out(`Reset HEAD to [${parentBranchName} – ${commitHash}]`),
              `git pull > /dev/null`,
              `git reset ${commitHash} > /dev/null`,
              () => out(`Commiting to ${branchName}`),
              `git add . -A > /dev/null`,
              `git commit -m "${commitMessage}"`,
              () => out(`Pushing to origin`),
              `git push -f origin $branch_name > /dev/null`,
            ]).catch(() => {
              out(`Error. Rolling back changes`)
              reflogReset(commitHash)

              const hash = getLastCommitHash(branchName)
              const message = getCommitMessage(hash)
              out(`You're now at [${hash.substr(0,7)}] ${message}`)
            }).then(() => {
              readline.close()
            })
          })
        } else {
          out('Bye!')
          readline.close()
        }
      })
    })
  })
}

squash()
