declare module "solc" {
  const solc: {
    version(): string;
    compile(input: string): string;
  };
  export default solc;
}
