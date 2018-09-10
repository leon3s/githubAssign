'use strict';

const express = require('express');
const SlackBot = require('slackbots');

const GithubApi = require('@leone/githubapi');

class GithubAssign {
  constructor(config) {
    this.githubApi = new GithubApi(
      config.githubToken
    );
    this.slackBot = new SlackBot({
      name: config.name,
      token: config.slackToken,
    });
    this.reviewers = config.reviewers;
    const router = express.Router();
    router.use(express.json());
    router.post(config.webhookUrl, this.middleware.bind(this));
    return router;
  }

  async assignPeople(options) {
    const repo = this.githubApi.repo(options.owner, options.repoName);
    try {
      const reviewers = [...this.reviewers]
        .filter((reviewer) => reviewer.githubAccount !== options.prOwner);
      const githubAccounts = reviewers.map((reviewer) => {
        return reviewer.githubAccount;
      });
      await repo.assingUserToIssue(options.number, {
        assignees: githubAccounts,
      });
      await repo.assignUserForReview(options.number, {
        reviewers: githubAccounts,
      });
      const hastags = `@${githubAccounts.join('@ ')}`;
      await repo.createCommentIssue(options.number, {
        body: `${hastags} review are required to merge this pull request`,
      });

      reviewers.forEach((reviewer) => {
        const { slackAccount } = reviewer;
        this.slackBot.postMessageToUser(reviewer.slackAccount,
          `Hi ${slackAccount} this pull request require your review\n${options.url}`
        );
      });
      return { done: true };
    } catch (e) { throw e; };
  }

  middleware(req, res, next) {
    if (req.body.action !== 'opened' || !req.body.pull_request) {
      return res.json({
        status: 200,
        message: 'Nothing to do',
      });
    }

    const {
      number,
      repository,
      pull_request,
    } = req.body;

    this.assignPeople({
      number,
      url: pull_request.html_url,
      prOwner: pull_request.user.login,
      repoName: repository.name,
      owner: repository.owner.login,
      branch: pull_request.head.ref,
    }).then((response) => {
      res.json(response);
    }).catch((err) => {
      const error = new Error();
      error.statusCode = 500;
      error.stack = `${err}`;
      next(error);
    });
  }
}

function standalone(config, callback) {
  const app = express();
  app.use(new GithubAssign(config));
  app.listen(config.port, callback);
}

module.exports = config => new GithubAssign(config);

module.exports.standalone = standalone;

standalone({
  port: 3000,
  reviewers: [],
  webhookUrl: '/webhook/github',
  githubToken: '00e17bf55663db6496617c0bcbb39ed10dc6bb64',
  slackToken: 'xoxb-213055366178-433688484951-Rxmc5UQ0AoLHGaC8J2VcBGfV',
});
