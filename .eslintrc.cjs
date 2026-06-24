module.exports = {
  root: true,
  env: { node: true, es2022: true },
  extends: [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended"
  ],
  parser: "@typescript-eslint/parser",
  plugins: ["@typescript-eslint"],
  parserOptions: {
    sourceType: "module",
    ecmaVersion: 2022,
  },
  rules: {
    "@typescript-eslint/no-explicit-any": "warn",
    "@typescript-eslint/no-unused-vars": "warn",
    "@typescript-eslint/no-empty-object-type": "warn",
    "@typescript-eslint/no-require-imports": "warn",
    "no-empty": "warn",
    "no-control-regex": "warn"
  },
  overrides: [
    {
      // WP-B1: Prevent regression to throw new Error() in migrated files
      files: [
        "packages/integrations-llm/src/client.ts",
        "packages/sentinel/src/approval.ts",
        "packages/kage-engine/src/intake.ts",
        "packages/kage-engine/src/coordinator.ts",
        "packages/roster/src/roster.ts",
      ],
      rules: {
        "no-restricted-syntax": [
          "error",
          {
            "selector": "ThrowStatement[argument.type='NewExpression'][argument.callee.name='Error']",
            "message": "Use NinjaError or a subclass (ADR-0001). Plain 'throw new Error()' is forbidden in this file. See packages/contracts/src/errors.ts."
          }
        ]
      }
    }
  ]
};
