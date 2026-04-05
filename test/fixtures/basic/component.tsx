import { helper } from "./utils";

interface Props {
  name: string;
}

export function Greeting({ name }: Props): JSX.Element {
  const val = helper(42);
  return <div>Hello {name} {val}</div>;
}

export function App(): JSX.Element {
  return <Greeting name="World" />;
}
