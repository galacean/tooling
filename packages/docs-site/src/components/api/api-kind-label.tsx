export type APIKindGroup =
  | 'functions'
  | 'interfaces'
  | 'types'
  | 'classes'
  | 'variables'
  | 'enums'
  | 'properties'
  | 'methods'
  | 'members'
  | 'other';

const groups: Record<number, APIKindGroup> = {
  64: 'functions',
  256: 'interfaces',
  2097152: 'types',
  128: 'classes',
  32: 'variables',
  8: 'enums',
  16: 'members',
  1024: 'properties',
  2048: 'methods',
};

const letters: Record<APIKindGroup, string> = {
  functions: 'F',
  interfaces: 'I',
  types: 'T',
  classes: 'C',
  variables: 'V',
  enums: 'E',
  properties: 'P',
  methods: 'M',
  members: 'E',
  other: '·',
};

export function apiKindGroup(kind: number): APIKindGroup {
  return groups[kind] ?? 'other';
}

export function APIKindLabel({
  kind,
  label,
  compact = false,
}: {
  kind: number;
  label: string;
  compact?: boolean;
}) {
  const group = apiKindGroup(kind);

  return (
    <span
      className={`kind-label kind-${group}${compact ? ' compact' : ''}`}
      title={label}
    >
      {compact ? letters[group] : label}
    </span>
  );
}
