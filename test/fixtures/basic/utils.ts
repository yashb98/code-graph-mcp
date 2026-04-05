export function helper(x: number): number {
  return x * 2;
}

export function unused(): void {
  // This function is never called
}

export { helper as default };
