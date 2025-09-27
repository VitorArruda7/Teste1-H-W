import { chunkArray } from '../utils/chunk';

describe('chunkArray', () => {
  it('partitions an array into equal chunks', () => {
    const result = chunkArray([1, 2, 3, 4], 2);
    expect(result).toEqual([[1, 2], [3, 4]]);
  });

  it('handles leftover elements in the final chunk', () => {
    const result = chunkArray([1, 2, 3, 4, 5], 2);
    expect(result).toEqual([[1, 2], [3, 4], [5]]);
  });

  it('throws when size is not positive', () => {
    expect(() => chunkArray([1, 2], 0)).toThrow('Chunk size must be greater than zero');
  });
});
