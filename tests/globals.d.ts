import { assert as _assert } from 'chai';
import _intern from 'src/core';
import _registerSuite from 'src/core/lib/interfaces/object';

declare global {
  export const registerSuite: typeof _registerSuite;
  export const assert: typeof _assert;
  export const intern: typeof _intern;
}
