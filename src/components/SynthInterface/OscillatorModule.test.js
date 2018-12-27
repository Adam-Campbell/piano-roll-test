import React from 'react';
import { shallow } from 'enzyme';
import OscillatorModule from './OscillatorModule';
import { synthData } from '../../constants';

const oscillatorData = synthData.synth.oscillator;

test('renders correctly', () => {
    const component = shallow(
        <OscillatorModule 
            oscillatorData={oscillatorData}
            instrumentId="5542150612118159"
            additionalNesting={[]}
            handleChange={jest.fn()}
        />
    );
    expect(component).toMatchSnapshot();
});