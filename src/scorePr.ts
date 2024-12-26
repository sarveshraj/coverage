import * as core from '@actions/core'

import {FilesCoverage} from './coverage'
import {formatAverageTable, formatFilesTable, toPercent} from './format'
import {context} from '@actions/github'
import {octokit} from './client'

const TITLE = `# ☂️ Coverage Report`

export async function publishMessage(pr: number, message: string): Promise<void> {
  const body = TITLE.concat(message)
  core.summary.addRaw(body).write()

  let comments
  try {
    comments = await octokit.rest.issues.listComments({
      ...context.repo,
      issue_number: pr
    })
  } catch (error) {
    core.error(`Error listing comments: ${error}`)
  }

  const exist = comments?.data.find(comment => {
    return comment.body?.startsWith(TITLE)
  })

  if (exist) {
    try {
      await octokit.rest.issues.updateComment({
        ...context.repo,
        issue_number: pr,
        comment_id: exist.id,
        body
      })
    } catch (error) {
      core.error(`Error updating comment: ${error}`)
    }
  } else {
    try {
      await octokit.rest.issues.createComment({
        ...context.repo,
        issue_number: pr,
        body
      })
    } catch (error) {
      core.error(`Error creating comment: ${error}`)
    }
  }
}

export function scorePr(filesCover: FilesCoverage): boolean {
  let message = ''
  let passOverall = true

  core.startGroup('Results')
  const {coverTable: avgCoverTable, pass: passTotal} = formatAverageTable(filesCover.averageCover)
  message = message.concat(`\n## Overall Coverage\n${avgCoverTable}`)
  passOverall = passOverall && passTotal
  const coverAll = toPercent(filesCover.averageCover.ratio)
  passTotal ? core.info(`Average coverage ${coverAll} ✅`) : core.error(`Average coverage ${coverAll} ❌`)

  if (filesCover.newCover?.length) {
    const {coverTable, pass: passNew} = formatFilesTable(filesCover.newCover)
    passOverall = passOverall && passNew
    message = message.concat(`\n## New Files\n${coverTable}`)
    passNew ? core.info('New files coverage ✅') : core.error('New Files coverage ❌')
  } else {
    message = message.concat(`\n## New Files\nNo new covered files...`)
    core.info('No covered new files in this PR ')
  }

  if (filesCover.modifiedCover?.length) {
    const {coverTable, pass: passModified} = formatFilesTable(filesCover.modifiedCover)
    passOverall = passOverall && passModified
    message = message.concat(`\n## Modified Files\n${coverTable}`)
    passModified ? core.info('Modified files coverage ✅') : core.error('Modified Files coverage ❌')
  } else {
    message = message.concat(`\n## Modified Files\nNo covered modified files...`)
    core.info('No covered modified files in this PR ')
  }
  const sha = context.payload.pull_request?.head.sha.slice(0, 7)
  const action = '[action](https://github.com/marketplace/actions/python-coverage)'
  message = message.concat(`\n\n\n> **updated for commit: \`${sha}\` by ${action}🐍**`)
  message = `\n> current status: ${passOverall ? '✅' : '❌'}`.concat(message)
  publishMessage(context.issue.number, message)
  core.endGroup()

  return passOverall
}
