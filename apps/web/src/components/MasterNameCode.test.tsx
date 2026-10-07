import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import MasterNameCode from './MasterNameCode';

it('renders the business name first and the code as a secondary line', () => {
  const html = renderToStaticMarkup(<MasterNameCode name="2号鸡舍" code="HOUSE_MS_02" />);
  expect(html.indexOf('2号鸡舍')).toBeLessThan(html.indexOf('HOUSE_MS_02'));
  expect(html).toContain('muted');
});
it.each(['', 'HOUSE_MS_02'])('renders the identifier once when name is %s', name => {
  const html = renderToStaticMarkup(<MasterNameCode name={name} code="HOUSE_MS_02" />);
  expect(html.match(/HOUSE_MS_02/g)).toHaveLength(1);
});
