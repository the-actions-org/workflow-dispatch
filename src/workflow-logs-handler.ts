import * as core from '@actions/core'
import * as github from '@actions/github'
import { debug } from './debug';

interface JobInfo {
  name: string,
  id: string
}
interface JobLogs {
  job: JobInfo,
  logs?: string,
  error?: Error
}


async function getWorkflowLogsPerJob(octokit: any, workflowRunId: number, owner: string, repo: string): Promise<Array<JobLogs>> {
  const logsPerJob: Array<JobLogs> = []

  const runId = workflowRunId;
  const response = await octokit.rest.actions.listJobsForWorkflowRun({
    owner: owner,
    repo: repo,
    run_id: runId
  });

  debug('Jobs in workflow', response);

  for (const job of response.data.jobs) {
    try {
      const jobLog = await octokit.rest.actions.downloadJobLogsForWorkflowRun({
        owner: owner,
        repo: repo,
        job_id: job.id,
      });
      debug(`Job ${job.id} log`, jobLog);

      logsPerJob.push({
        job: job,
        logs: jobLog.data?.toString()
      });
    } catch (error) {
      debug('Job log download error', error);
      logsPerJob.push({
        job: job,
        error: error instanceof Error ? error : new Error(`${error}`)
      });
    }
  }

  return logsPerJob;
}



export interface WorkflowLogHandler {
  handle(): Promise<void>
}

class NoOpLogsHandler implements WorkflowLogHandler {
  async handle(): Promise<void> {
  }
}

class PrintLogsHandler implements WorkflowLogHandler {
  private octokit: any;

  constructor(token: string,
              private workflowRunId: number,
              private owner: string,
              private repo: string) {
    // Get octokit client for making API calls
    this.octokit = github.getOctokit(token);
  }

  async handle(): Promise<void> {
    const logsPerJob = await getWorkflowLogsPerJob(this.octokit, this.workflowRunId, this.owner, this.repo);

    for (const jobLogs of logsPerJob) {
      core.info(`::group::Logs of job '${jobLogs.job.name}'`);
      if (jobLogs.logs) {
        core.info(jobLogs.logs);
      }
      if (jobLogs.error) {
        core.warning(jobLogs.error);
      }
      core.info(`::endgroup::`);
    }
  }
}

export function logHandlerFactory(mode: string, token: string, workflowRunId: number, owner: string, repo: string): WorkflowLogHandler {
  switch(mode) {
    case 'print': return new PrintLogsHandler(token, workflowRunId, owner, repo);
    default: return new NoOpLogsHandler();
  }
}