/*
 * Copyright 2020 Spotify AB
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { ApiRef } from './ApiRef';
import {
  ApiHolder,
  ApiFactoryHolder,
  AnyApiRef,
  TypesToApiRefs,
} from './types';

export class ApiResolver implements ApiHolder {
  private readonly apis = new Map<AnyApiRef, unknown>();

  /**
   * Validate factories by making sure that each of the apis can be created
   * without hitting any circular dependencies.
   */
  static validateFactories(
    factories: ApiFactoryHolder,
    apis: Iterable<AnyApiRef>,
  ) {
    for (const api of apis) {
      const heap = [api];
      const allDeps = new Set<AnyApiRef>();

      while (heap.length) {
        const apiRef = heap.shift()!;
        const factory = factories.get(apiRef);
        if (!factory) {
          continue;
        }

        for (const dep of Object.values(factory.deps)) {
          if (dep === api) {
            throw new Error(`Circular dependency of api factory for ${api}`);
          }
          if (!allDeps.has(dep)) {
            allDeps.add(dep);
            heap.push(dep);
          }
        }
      }
    }
  }

  constructor(private readonly factories: ApiFactoryHolder) {}

  get<T>(ref: ApiRef<T>): T | undefined {
    return this.load(ref);
  }

  private load<T>(ref: ApiRef<T>, loading: AnyApiRef[] = []): T | undefined {
    const impl = this.apis.get(ref);
    if (impl) {
      return impl as T;
    }

    const factory = this.factories.get(ref);
    if (!factory) {
      return undefined;
    }

    if (loading.includes(factory.implements)) {
      throw new Error(
        `Circular dependency of api factory for ${factory.implements}`,
      );
    }

    const deps = this.loadDeps(ref, factory.deps, [
      ...loading,
      factory.implements,
    ]);
    const api = factory.factory(deps);
    this.apis.set(ref, api);
    return api as T;
  }

  private loadDeps<T>(
    dependent: ApiRef<unknown>,
    apis: TypesToApiRefs<T>,
    loading: AnyApiRef[],
  ): T {
    const impls = {} as T;

    for (const key in apis) {
      if (apis.hasOwnProperty(key)) {
        const ref = apis[key];

        const api = this.load(ref, loading);
        if (!api) {
          throw new Error(
            `No API factory available for dependency ${ref} of dependent ${dependent}`,
          );
        }
        impls[key] = api;
      }
    }

    return impls;
  }
}
