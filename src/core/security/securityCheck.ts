import { setTimeout } from 'node:timers/promises';
import { lintSource } from '@secretlint/core';
import { creator } from '@secretlint/secretlint-rule-preset-recommend';
import type { SecretLintCoreConfig, SecretLintCoreResult } from '@secretlint/types';
import pMap from 'p-map';
import pc from 'picocolors';
import { logger } from '../../shared/logger.js';
import { getProcessConcurrency } from '../../shared/processConcurrency.js';
import type { RepomixProgressCallback } from '../../shared/types.js';
import type { RawFile } from '../file/fileTypes.js';

export interface SuspiciousFileResult {
  filePath: string;
  messages: string[];
}

export const runSecurityCheck = async (
  rawFiles: RawFile[],
  progressCallback: RepomixProgressCallback = () => {},
): Promise<SuspiciousFileResult[]> => {
  const secretLintConfig = createSecretLintConfig();

  const results = await pMap(
    rawFiles,
    async (rawFile, index) => {
      progressCallback(`Running security check... (${index + 1}/${rawFiles.length}) ${pc.dim(rawFile.path)}`);

      logger.trace(`Checking security on ${rawFile.path}`);

      const processStartAt = process.hrtime.bigint();
      const secretLintResult = await runSecretLint(rawFile.path, rawFile.content, secretLintConfig);
      const processEndAt = process.hrtime.bigint();

      logger.trace(
        `Checked security on ${rawFile.path}. Took: ${(Number(processEndAt - processStartAt) / 1e6).toFixed(2)}ms`,
      );

      // Sleep for a short time to prevent blocking the event loop
      await setTimeout(1);

      if (secretLintResult.messages.length > 0) {
        return {
          filePath: rawFile.path,
          messages: secretLintResult.messages.map((message) => message.message),
        };
      }

      return null;
    },
    {
      concurrency: getProcessConcurrency(),
    },
  );

  return results.filter((result): result is SuspiciousFileResult => result != null);
};

export const runSecretLint = async (
  filePath: string,
  content: string,
  config: SecretLintCoreConfig,
): Promise<SecretLintCoreResult> => {
  const result = await lintSource({
    source: {
      filePath: filePath,
      content: content,
      ext: filePath.split('.').pop() || '',
      contentType: 'text',
    },
    options: {
      config: config,
    },
  });

  if (result.messages.length > 0) {
    logger.trace(`Found ${result.messages.length} issues in ${filePath}`);
    logger.trace(result.messages.map((message) => `  - ${message.message}`).join('\n'));
  }

  return result;
};

export const createSecretLintConfig = (): SecretLintCoreConfig => ({
  rules: [
    {
      id: '@secretlint/secretlint-rule-preset-recommend',
      rule: creator,
    },
  ],
});
