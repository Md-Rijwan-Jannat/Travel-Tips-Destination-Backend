import { describe, expect, it, vi } from "vitest";
import QueryBuilder from "../app/builder/QueryBuilder";

type MockQuery = {
  find: ReturnType<typeof vi.fn>;
  sort: ReturnType<typeof vi.fn>;
  skip: ReturnType<typeof vi.fn>;
  limit: ReturnType<typeof vi.fn>;
  select: ReturnType<typeof vi.fn>;
  getFilter: ReturnType<typeof vi.fn>;
  model: { countDocuments: ReturnType<typeof vi.fn> };
};

const makeQuery = (): MockQuery => {
  const q: MockQuery = {
    find: vi.fn(() => q),
    sort: vi.fn(() => q),
    skip: vi.fn(() => q),
    limit: vi.fn(() => q),
    select: vi.fn(() => q),
    getFilter: vi.fn(() => ({})),
    model: { countDocuments: vi.fn(() => 0) },
  };
  return q;
};

describe("QueryBuilder.filter — NoSQL operator injection", () => {
  it("strips top-level $ operator keys", () => {
    const q = makeQuery();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    new QueryBuilder(q as any, { status: "ACTIVE", $where: "sleep(1000)" }).filter();

    expect(q.find).toHaveBeenCalledWith({ status: "ACTIVE" });
  });

  it("strips operators smuggled through object values", () => {
    const q = makeQuery();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    new QueryBuilder(q as any, { email: { $ne: null } }).filter();

    expect(q.find).toHaveBeenCalledWith({ email: {} });
  });

  it("strips dotted keys", () => {
    const q = makeQuery();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    new QueryBuilder(q as any, { "a.b": 1, c: 2 }).filter();

    expect(q.find).toHaveBeenCalledWith({ c: 2 });
  });
});

describe("QueryBuilder.paginate — limit abuse", () => {
  it("caps oversized limits", () => {
    const q = makeQuery();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    new QueryBuilder(q as any, { limit: 10000000000000 }).paginate();

    expect(q.limit).toHaveBeenCalledWith(500);
  });

  it("defaults to 100 when limit is missing", () => {
    const q = makeQuery();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    new QueryBuilder(q as any, {}).paginate();

    expect(q.limit).toHaveBeenCalledWith(100);
  });

  it("handles string page/limit values from the query string", () => {
    const q = makeQuery();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    new QueryBuilder(q as any, { page: "3", limit: "20" }).paginate();

    expect(q.skip).toHaveBeenCalledWith(40);
    expect(q.limit).toHaveBeenCalledWith(20);
  });
});

describe("QueryBuilder.search — regex injection", () => {
  it("escapes regex metacharacters in searchTerm", () => {
    const q = makeQuery();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    new QueryBuilder(q as any, { searchTerm: "a+.*b" }).search(["title"]);

    expect(q.find).toHaveBeenCalledWith({
      $or: [{ title: { $regex: "a\\+\\.\\*b", $options: "i" } }],
    });
  });
});
