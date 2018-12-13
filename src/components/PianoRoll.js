import React, { Component } from 'react';
import { Stage, Layer, Rect, Line, Text } from 'react-konva';
import Konva from 'konva';
import { connect } from 'react-redux';
import * as ActionCreators from '../actions';
import { generateId } from '../helpers';
import Tone from 'tone';
import QuantizeSelect from './QuantizeSelect';
import CursorSelect from './CursorSelect';
import DurationSelect from './DurationSelect';
import { Rnd } from 'react-rnd';
import { debounce, throttle } from 'lodash';

class PianoRoll extends Component {
    constructor(props) {
        super(props);
        this.padding = 10;
        this.pianoKeysWidth = 48
        this.stageRef = React.createRef();
        this.gridLayerRef = React.createRef();
        this.noteLayerRef = React.createRef();
        this.pianoKeyLayerRef = React.createRef();
        this.transportLayerRef = React.createRef();
        this.seekerLayerRef = React.createRef();
        this.seekerLineRef = React.createRef();
        this.rAFRef = null;
        this.horizontalDragMove = throttle(this._horizontalDragMove, 16).bind(this);
        this.verticalDragMove = throttle(this._verticalDragMove, 16).bind(this);
        this.canvasWidth = this.section.numberOfBars * 384;
        this.canvasHeight = 1768;
        this._notesArray = this._createNotesArray();
        this._transportBarNumbersArray = this._createTransportBarNumbersArray();
        this.handleStageClick = this._handleStageClick.bind(this);
        this.handleMouseDown = this._handleMouseDown.bind(this);
        this.handleMouseUp = this._handleMouseUp.bind(this);
        this.state = {
            quantize: '16n',
            duration: '16n',
            mouseDownPosX: 0,
            mouseDownPosY: 0,
            pencilActive: false,
            isDraggable: false,
            layerPosX: 0,
            layerPosY: 0,
            stageWidth: 800,
            stageHeight: 600
        };
    }

    componentDidMount() {
        const initialLineAttrs = this.getTransportLineAttrs();
        this.seekerLineRef.current.x(initialLineAttrs.xPos);
        this.seekerLineRef.current.strokeWidth(initialLineAttrs.strokeWidth);
        this.seekerLayerRef.current.batchDraw();
    }

    componentWillUnmount() {
        /*why does this fix the error previously being caused by destroy method on stage being 
        called at unmount? Destroy method for reference:

        destroy: function destroy() {
            var content = this.content;
            Konva.Container.prototype.destroy.call(this);

            if (content && Konva.Util._isInDocument(content)) {
                this.getContainer().removeChild(content);
            }

            var index = Konva.stages.indexOf(this);

            if (index > -1) {
                Konva.stages.splice(index, 1);
            }

            return this;
        }
        */
        if (this.rAFRef) {
            cancelAnimationFrame(this.rAFRef);
        }
        this.stageRef.current.content = null;
    }

    componentDidUpdate(prevProps, prevState, snapshot) {
        if (prevProps.isPlaying !== this.props.isPlaying) {
            if (this.props.isPlaying) {
                requestAnimationFrame(this.getTransportPosition);
            } else {
                cancelAnimationFrame(this.rAFRef);
                this.seekerLineRef.current.strokeWidth(0);
                this.seekerLineRef.current.x(-96);
                this.seekerLayerRef.current.batchDraw();
            }
        }
    }

    /**
     * The main function responsible for updating the seeker line, called in each animation frame, gets
     * the new location for the seeker line and redraws the seeker layer of the canvas. 
     */
    getTransportPosition = () => {
        const newLineAttrs = this.getTransportLineAttrs();        
        this.seekerLineRef.current.x(newLineAttrs.xPos);
        this.seekerLineRef.current.strokeWidth(newLineAttrs.strokeWidth);
        this.seekerLayerRef.current.batchDraw();
        this.rAFRef = requestAnimationFrame(this.getTransportPosition);
    }

    /**
     * Given a BBS string, determine the amount of whole bars present in the time described by the string
     * and return this value as an integer.
     * @param {string} transportPositionString - the BBS string to query
     * @return {number} - the whole bars as an integer.
     */
    getWholeBarsFromString = (transportPositionString) => {
        const splitString= transportPositionString.split(':');
        return parseInt(splitString[0]);
    }

    /**
     * Given a BBS string, reduce the string down on floating point number which is the total value of the 
     * bars, beats and sixteenths, all in terms of sixteenths. 
     * @param {string} transportPositionString - the BBS string to query.
     * @return {number} - the amount of sixteenths as a floating point number - if it doesn't come to a
     * discrete amount of sixteenths it will return parts of sixteenths as well.
     */
    transportPositionStringToSixteenths = (transportPositionString) => {
        const splitString= transportPositionString.split(':');
        const asSixteenths = parseInt(splitString[0])*16 + 
                           parseInt(splitString[1])*4 +
                           parseFloat(splitString[2]);
        return asSixteenths;
    }

    /**
     * Works out the next x position that the seeker line needs to be rendered to. Only used by the 
     * getTransportPosition() function.
     * @return {object} - an object containing the information needed for the next render. 
     */
    getTransportLineAttrs = () => {
        // verify whether current transport position is within this section. If not, return some value
        // for xPos (unimportant in this case), and return 0 for strokeWidth.
        // If it is in this section, return 2 for strokeWidth and return a precise xPos.
        const currentTransportPosition = Tone.Transport.position;
        const sectionStartBar = this.getWholeBarsFromString(this.section.start);
        const sectionEndBar = sectionStartBar + this.section.numberOfBars;
        const currentTransportBar = this.getWholeBarsFromString(currentTransportPosition);
        if (currentTransportBar < sectionStartBar || currentTransportBar > sectionEndBar) {
            return {
                xPos: -96,
                strokeWidth: 0
            };
        } else {
            const sectionStartAsSixteenths = this.transportPositionStringToSixteenths(this.section.start);
            const currentPositionAsSixteenths = this.transportPositionStringToSixteenths(currentTransportPosition);
            const diff = currentPositionAsSixteenths - sectionStartAsSixteenths;
            const diffToXPos = (diff * 24);
            return {
                xPos: diffToXPos,
                strokeWidth: 2
            };
        }
    }

    /**
     * Handles a click that occurs within the Transport section of the canvas, delegating to other
     * functions as needed. 
     * @param {number} xPos - the x position of the click event that occurred. 
     */
    handleTransportClick = (xPos) => {
        // We get the raw xPos as an argument. 
        //
        // Eventual goals - we want to produce an x position for the seekerLine to be rendered at,
        // and we want to produce a corresponding time on the timeline for the track to move to. This 
        // timeline could either be in BBS or in Ticks.
        //
        // First we establish a single source of truth for how far into the section the user has clicked. 
        // Take the raw xPos and subtract this.pianoKeysWidth from it to account for the piano keys offsetting 
        // the layers. 
        // Now we adjust for any potential scrolling. get the current x for an applicable layer and subtract 48
        // from it - because this layer starts off with an x of 48. This means if no scrolling has occurred we
        // get 0, or if any scrolling has occurred we will get some negative value corresponding to the amount
        // scrolled. We take the value we get, and subtract it from our xPos (effectively adding it since we
        // know the number is non-positive).
        //
        // Now we adjust for quantization to get a nice figure. Grab the current quantize level from state and
        // convert it into Ticks, then divide by 2 (because 2 ticks correspond to 1 pixel in the UI). 
        // Now we use modulo to adjust our xPos into the last whole interval according to our quantize level. 
        //
        // The figure we now have can be used to update the UI - it will match perfectly with the new x position
        // for the seeker line to be rendered at. However more work is needed to calculate the transport position
        // to move the track to. 
        // First grab this.section.start, which is currently in BBS, and convet to Ticks. Then, take the final
        // figure we got for our x pos in the UI, and multiply it by 2 to get the corresponding ticks value. We
        // now have the start of the section in Ticks, and our progress into the section in Ticks, we can add those
        // together and convert to BBS, then update the track position to this new BBS value. 
        //
        const xPosAdjustedForKeys = xPos - this.pianoKeysWidth;
        const scrolledX = (this.seekerLayerRef.current.attrs.x || 48) - 48;
        const xPosAdjustedForScroll = xPosAdjustedForKeys - scrolledX;
        const currQuantizeAdjustment = Tone.Time(this.state.quantize).toTicks() / 2;
        const xPosAdjustedForQuantize = xPosAdjustedForScroll-(xPosAdjustedForScroll%currQuantizeAdjustment);
        const finalUIxPos = xPosAdjustedForQuantize;
        const sectionStartAsTicks = Tone.Time(this.section.start).toTicks();
        const sectionProgressAsTicks =  xPosAdjustedForQuantize * 2;
        const newTransportPosition = Tone.Ticks(sectionStartAsTicks+sectionProgressAsTicks).toBarsBeatsSixteenths();
        Tone.Transport.position = newTransportPosition;
        this.seekerLineRef.current.strokeWidth(2);
        this.seekerLineRef.current.x(finalUIxPos);
        this.seekerLayerRef.current.batchDraw();
    }

    /**
     * Convenience method for accessing the specific section object corresponding to the sectionId that
     * was passed in as a prop
     * @return {object} - the section object
     */
    get section() {
        return this.props.sections[this.props.id];
    }

    /**
     * Programmaticaly create an array of all of the notes ranging from C0 to B8.
     * @return {array} - the array of notes.
     */
    _createNotesArray() {
        const onlyNotes = ['B', 'A#', 'A','G#', 'G', 'F#', 'F', 'E', 'D#', 'D', 'C#', 'C'];
        const onlyOctaves = ['8', '7', '6', '5', '4', '3', '2', '1', '0'];
        let notesArray = [];
        for (let octave of onlyOctaves) {
            for (let note of onlyNotes) {
                notesArray.push(note + octave);
            }
        }
        return notesArray;
    }

    /**
     * Programatically creates an array of objects describing each individual grid line required by the
     * component, such that when it comes to rendering the component can simply map over this array and
     * construct a <Line/> component from each object in the array. 
     * @return {array} - the array of grid line objects.
     */
    _createGridLinesArray() {
        let linesArray = [];
        let strokeWidth = 2;
        let escapeHatch = 0;
        let currPos = 0;
        let quantizeInterval = Tone.Time(this.state.quantize).toTicks() / 2;

        while(currPos <= this.canvasWidth && escapeHatch < 1000) {
            if (currPos % 384 === 0) {
                strokeWidth = 2;
            } else if (currPos % 96 === 0) {
                strokeWidth = 1;
            } else {
                strokeWidth = 0.5;
            }
            linesArray.push({
                points: [currPos, 0, currPos, 1728],
                strokeWidth: strokeWidth
            });
            currPos += quantizeInterval;
            escapeHatch++;
        }

        // create horizontal lines
        for (let j = 0; j <= 108; j++) {
            linesArray.push({
                points: [0, j*16, this.canvasWidth, j*16],
                strokeWidth: 1
            });
        }

        return linesArray;
    }

    /**
     * Given an x and y position for a click event that has occurred, performs the calculations required
     * to create a note object corresponding to the x and y values supplied as arguments.
     * @param {number} x - x position of the click event
     * @param {number} y - y position of the click event
     * @return {object} - the generated note object. 
     */
    _calculateNoteInfo(x, y) {
        let currQuantizeAsTicks = Tone.Time(this.state.quantize).toTicks();
        let rowClicked = Math.floor(y / 16);
        let adjustedX = x - (x%(currQuantizeAsTicks/2));
        let adjustedY = y - (y % 16);
        let xPosAsTicks = Tone.Ticks(x*2-(x*2%currQuantizeAsTicks)).toBarsBeatsSixteenths();
        const duration = this.state.duration;
        const noteInfo = {
            pitch: this._notesArray[rowClicked],
            time: xPosAsTicks,
            duration: duration,
            _id: generateId(),
            x: adjustedX,
            y: adjustedY,
            width: Tone.Time(duration).toTicks() / 2
        };
        return noteInfo;
    }

    /**
     * The main function for handling click events on the canvas, delegating to other functions as needed.
     * @param {object} e - the event object supplied by the browser 
     */
    _handleStageClick(e) {
        //console.log(e);
        let t = e.target;
        const xPos = e.evt.layerX;
        const yPos = e.evt.layerY;
        if (yPos < 40) {
            this.handleTransportClick(xPos);
            return;
        }
        if (t.attrs.type && t.attrs.type === 'noteRect') {
            const { pitch, time } = t.attrs;
            this.props.removeNote(this.section.id, pitch, time);
        } else {
            if (!this.state.pencilActive) {
                let x = e.evt.layerX;
                let scrolledX = this.gridLayerRef.current.attrs.x || 0;
                let xWithScroll = x - scrolledX;
                let y = e.evt.layerY;
                let scrolledY = this.gridLayerRef.current.attrs.y || 0;
                let yWithScroll = y - scrolledY;
                let noteObject = this._calculateNoteInfo(xWithScroll, yWithScroll);
                if (this._isValidNote(noteObject)) {
                    this.props.addNote(this.section.id, noteObject);
                }
            }
        }
    }

    /**
     * The main function for handling mouseDown events on the canvas, delegating to other functions as needed.
     * @param {object} e - the event object supplied by the browser
     */
    _handleMouseDown(e) {
        if (this.state.pencilActive) {
            // if a note was clicked on just return, the onClick handler already contains all of the
            // logic for that. 
            if (e.target.attrs.type && e.target.attrs.type === 'noteRect') {
                return;
            }
            // All we do here is update state with the coordinates that the mouseDown event happened
            // at, as the mouseUp event handler will later need to reference these.
            const scrolledX = this.gridLayerRef.current.attrs.x || 0;
            const scrolledY = this.gridLayerRef.current.attrs.y || 0;
            this.setState({
                mouseDownPosX: e.evt.layerX - scrolledX,
                mouseDownPosY: e.evt.layerY - scrolledY
            });
        }
    }

    /**
     * The main function for handling mouseUp events on the canvas, delegating to other functions as needed.
     * @param {object} e - the event object supplied by the browser.  
     */
    _handleMouseUp(e) {

        // todo - if the distance drawn (ie from pos x at mouseDown to pos x at mouseUp)
        // is less than the equivalent tick value according to the current quantize value
        // in state, then just use that tick value instead of a value based off of the actual
        // distance drawn. For example, at a quantize value of 8n the smallest notes we can
        // produce are 96 ticks. So if we draw a distance that comes to only 31 ticks after
        // everything has been converted/worked out, we ignore that 31 tick value and just use
        // 96 ticks instead. This ensures that we can never end up producing notes that are 
        // shorter than the current value we are quantizing for. 

        // for ref - 48 ticks = '16n'
        if (this.state.pencilActive) {
            // if a note was clicked on just return, the onClick handler already contains all of the
            // logic for that. 
            if (e.target.attrs.type && e.target.attrs.type === 'noteRect' || e.target.attrs.type === 'scrollRect') {
                return;
            }
            // We have take the information about the mouseDown event from state, and combined with
            // the information about this mouseUp event we have to calculate all of the details for 
            // the note that will be added - pitch, time, duration, _id, x, y, width.
            
            // x pos of cursor when mouseDown occurred
            let downX = this.state.mouseDownPosX;
            // y pos of cursor when mouseDown occurred
            let downY = this.state.mouseDownPosY;
            // x pos of cursor when mouseUp occurred, scrolledX is to account for any potential scrolling
            // of the canvas that has occured.
            let scrolledX = this.gridLayerRef.current.attrs.x || 0;
            let upX = e.evt.layerX - scrolledX;
            // current quantize value in state converted into ticks
            let currQuantizeAsTicks = Tone.Time(this.state.quantize).toTicks();
            // the row 'clicked' during mouseDown, according to the y pos
            let rowClicked = Math.floor(downY / 16);
            // the x pos during mouseDown, 'rolled back' to the last whole quantized unit,
            // based on the current quantize value. Can be used to set the visual x position
            // for the note on the grid.
            let adjustedDownX = downX - (downX%(currQuantizeAsTicks/2));
            // adjustment of the y pos during mouseDown, can be used to set the visual y 
            // position for the note on the grid.
            let adjustedDownY = downY - (downY % 16);
            // x pos during mousedown adjusted to a tick value. Note, this is different from
            // adjustedDownX - that is used for the visual coordinate of the note, whereas this
            // is used for the tick value that the note should start at. 
            let downXAsTicks = Tone.Ticks(adjustedDownX*2-(adjustedDownX*2%currQuantizeAsTicks));
            //let downXAsTicks = Tone.Ticks(downX*2-(downX*2%currQuantizeAsTicks));
            //let upXAsTicks = Tone.Ticks(upX*2-(upX*2%currQuantizeAsTicks));
            // x pos during mouseUp, adjusted to ticks, used to determine note duration.
            let upXAsTicks = Tone.Ticks(upX*2);
            // convert the tick-based downXAsTicks into "0:0:0" format.
            let noteTime = downXAsTicks.toBarsBeatsSixteenths();
            // work out the quantized, tick based length of the note based on the difference between
            // upXAsTicks and downXAsTicks
            let noteDurationAsTicks = Tone.Ticks(upXAsTicks-downXAsTicks).quantize(this.state.quantize);
            // convert the tick-based noteDurationAsTicks into notation format - '8n'.
            let noteDurationAsNotation = Tone.Ticks(noteDurationAsTicks).toNotation();
            
            const noteObject = {
                pitch: this._notesArray[rowClicked],
                time: noteTime,
                duration: noteDurationAsNotation,
                _id: generateId(),
                x: adjustedDownX,
                y: adjustedDownY,
                width: noteDurationAsTicks / 2 
            };
            if (this._isValidNote(noteObject)) {
                this.props.addNote(this.section.id, noteObject);
            }

        }
    }

    /**
     * Given a new note, noteToCheck, check this note against all other notes with the same pitch in this
     * section, if this note overlaps any of those notes then it is invalid and the function returns false,
     * if no such note is found then the new note is valid and the function returns true.
     * @param {Object} noteToCheck - the note object for the new note to check.
     * @returns {Boolean} - true if note is valid, false if note is invalid.
     */
    _isValidNote(noteToCheck) {
        const startOfNoteToCheck = Tone.Time(noteToCheck.time).toTicks();
        const endOfNoteToCheck = startOfNoteToCheck + Tone.Time(noteToCheck.duration).toTicks() - 1;
        for (let currentNote of this.section.notes) {
            if (noteToCheck.pitch === currentNote.pitch) {
                const startOfCurrentNote = Tone.Time(currentNote.time).toTicks();
                const endOfCurrentNote = startOfCurrentNote + Tone.Time(currentNote.duration).toTicks() - 1;
                if (
                    (startOfNoteToCheck >= startOfCurrentNote && startOfNoteToCheck <= endOfCurrentNote) ||
                    (endOfNoteToCheck >= startOfCurrentNote && endOfNoteToCheck <= endOfCurrentNote) ||
                    (startOfCurrentNote >= startOfNoteToCheck && startOfCurrentNote <= endOfNoteToCheck) ||
                    (endOfCurrentNote >= startOfNoteToCheck && endOfCurrentNote <= endOfNoteToCheck)
                ) {
                    // console.log(`
                    //     new note start: ${startOfNoteToCheck}
                    //     new note end: ${endOfNoteToCheck}
                    //     current note start: ${startOfCurrentNote}
                    //     current note end: ${endOfCurrentNote}
                    // `);
                    return false;
                }
            }
        }
        return true;
    }

    /**
     * Updates the quantize value in state.
     * @param {object} e - the event object supplied by the browser
     */
    updateQuantizeValue(e) {
        this.setState({
            quantize: e.target.value
        });
    }

    /**
     * Updates the duration value in state.
     * @param {object} e - the event object supplied by the browser
     */
    updateDurationValue(e) {
        this.setState({
            duration: e.target.value
        });
    }

    /**
     * Updates the pencilActive boolean value in state.
     * @param {object} e - the event object supplied by the browser 
     */
    updateCursorValue(e) {
        this.setState({
            pencilActive: e.target.value === 'pencil'
        });
    }

    /**
     * Handles making the necessary updates whenever the horizontal scroll bar is dragged.
     * @param {object} e - the event object 
     */
    _horizontalDragMove(e) {


        // Strategy
        // Work out how far along the horizontal slider is, as a percentage (or rather decimal)
        // of the total range of space it can reside in. 
        // Then, using the .x() method, set the x values for the canvas layers as the negative of
        // the total canvas width multiplied by the decimal previously calculated.
        //
        // Working out how far along the horizontal slider is:
        // total range is this.state.stageWidth - (this.padding * 2) - 100
        // current position within that range is e.target.attrs.x - this.padding
        // to decimal => current position / total range
        //
        // total range for overal canvas is canvasWidth - stageWidth
        //  
        //
        //

        // work out horizontal % delta
        const currentSliderPos = e.target.attrs.x - this.padding;
        const { stageWidth } = this.state; 
        const totalSliderRange = stageWidth - this.padding - 24 - 100;
        const delta = currentSliderPos / totalSliderRange;

        // update the layers

        const totalCanvasRange = this.canvasWidth - stageWidth + this.padding + 24 + 48;
        
        this.gridLayerRef.current.x(-(totalCanvasRange * delta) + 48);
        this.noteLayerRef.current.x(-(totalCanvasRange * delta) + 48);
        this.transportLayerRef.current.x(-(totalCanvasRange * delta) + 48);
        this.seekerLayerRef.current.x(-(totalCanvasRange * delta) + 48);
        this.gridLayerRef.current.batchDraw();
        this.noteLayerRef.current.batchDraw();
        this.transportLayerRef.current.batchDraw();
        this.seekerLayerRef.current.batchDraw();
    }

    /**
     * Handles making the necessary updates whenever the vertical scroll bar is dragged.
     * @param {object} e - the event object 
     */
    _verticalDragMove(e) {
        // make necessary calculations
        const currentSliderPos = e.target.attrs.y - this.padding;
        const { stageHeight } = this.state;
        const totalSliderRange = stageHeight - this.padding - 24 - 100;
        const delta = currentSliderPos / totalSliderRange;

        const canvasHeight = 1728;
        const totalCanvasRange = canvasHeight - stageHeight + this.padding + 24 + 40;

        // update the layers
        this.gridLayerRef.current.y(-(totalCanvasRange * delta) + 40);
        this.noteLayerRef.current.y(-(totalCanvasRange * delta) + 40);
        this.pianoKeyLayerRef.current.y(-(totalCanvasRange * delta) + 40);
        this.gridLayerRef.current.batchDraw();
        this.noteLayerRef.current.batchDraw();
        this.pianoKeyLayerRef.current.batchDraw();
    }

    /**
     * Handles the click of a piano key.
     * @param {object} e - the event object
     * @param {object} pitch - the pitch of the key that was clicked
     */
    handlePianoKeyClick = (e, pitch) => {
        e.cancelBubble = true;
        console.log(pitch);
    }

    /**
     * Programmaticaly creates an array of objects representing the bar numbers that should appear in the 
     * transport area of the canvas, such that when the component renders it can simply map over the array
     * and create a <Text/> component from each object in the array. 
     * @returns {array} - array containing the bar number objects.
     */
    _createTransportBarNumbersArray = () => {
        let arr = [];
        const start = parseInt(this.section.start.split(':')[0]);
        for (let i = 0; i < this.section.numberOfBars; i++) {
            arr.push({
                barNumber: start + i,
                xPos: i * 384
            });
        }
        return arr;
    }

    render() {
        const gridLinesArray = this._createGridLinesArray();

        return (
            <div className="piano-roll-container">
                <div className="piano-roll-controls-container">
                    <QuantizeSelect 
                        value={this.state.quantize} 
                        handleChange={this.updateQuantizeValue.bind(this)} 
                    />
                    <DurationSelect 
                        value={this.state.duration}
                        handleChange={this.updateDurationValue.bind(this)}
                    />
                    <CursorSelect 
                        value={this.state.pencilActive ? 'pencil' : 'pointer'}
                        handleChange={this.updateCursorValue.bind(this)}
                    />
                </div>
                <div className="canvas-container" id="piano-roll-canvas-container">
                    <Stage 
                        container={'piano-roll-canvas-container'}
                        ref={this.stageRef}
                        width={800} 
                        height={600} 
                        onClick={this.handleStageClick}
                        onMouseDown={this.handleMouseDown} 
                        onMouseUp={this.handleMouseUp}
                    >
                        <Layer 
                            x={48} 
                            y={40} 
                            ref={this.gridLayerRef} 
                        >
                            <Rect 
                                x={0}
                                y={0}
                                width={this.canvasWidth}
                                height={1728}
                                fill={'#201826'}
                            />
                            {
                                gridLinesArray.map((line, index) => (
                                    <Line 
                                        points={line.points}
                                        listening={false}
                                        stroke={'#d86597'}
                                        strokeWidth={line.strokeWidth}
                                        shadowColor={'#ed90b9'}
                                        shadowBlur={4}
                                        shadowOffsetX={0}
                                        shadowOffsetY={0}
                                        key={index}
                                    />
                                ))
                            }
                        </Layer>
                        <Layer
                            x={48}
                            y={40}
                            ref={this.noteLayerRef}
                        >
                        {
                            this.section.notes.map((note, index) => (
                                <Rect 
                                    x={note.x}
                                    y={note.y}
                                    width={note.width}
                                    height={16}
                                    stroke={'#d86597'}
                                    strokeWidth={2}
                                    fill={'#ed90b9'}
                                    shadowColor={'#d86597'}
                                    shadowBlur={4}
                                    shadowOffsetX={0}
                                    shadowOffsetY={0}
                                    pitch={note.pitch}
                                    time={note.time}
                                    type={'noteRect'}
                                    key={index}
                                />
                            ))
                        }
                        </Layer>
                        <Layer
                            y={40}
                            ref={this.pianoKeyLayerRef}
                        >
                            {this._notesArray.map((note, index) => (
                                <Rect 
                                    x={0}
                                    y={index * 16}
                                    width={48}
                                    height={16}
                                    stroke={'#201826'}
                                    strokeWidth={2}
                                    fill={note.includes('#') ? '#47426c' : '#e0e0e0'} 
                                    key={index} 
                                    pitch={note}
                                    type={'pianoKeyRect'}
                                    onClick={e => this.handlePianoKeyClick(e, note)}
                                />
                            ))}
                        </Layer>
                        <Layer
                            x={48}
                            ref={this.transportLayerRef}
                        >
                            <Rect 
                                x={-48}
                                y={0}
                                width={this.canvasWidth+52}
                                height={40}
                                fill={'#201826'}
                            />
                            {this._transportBarNumbersArray.map((barObject, index) =>(
                                <Text 
                                    text={barObject.barNumber}
                                    x={barObject.xPos}
                                    y={20}
                                    key={index}
                                    fill={'#e0e0e0'}
                                    shadowColor={'#e0e0e0'}
                                    shadowBlur={4}
                                    shadowOffsetX={0}
                                    shadowOffsetY={0}
                                />
                            ))}
                        </Layer>
                        <Layer
                            x={48}
                            ref={this.seekerLayerRef}
                        >
                            <Line
                                ref={this.seekerLineRef}
                                points={[0, 0, 0, this.canvasHeight]}
                                listening={false}
                                stroke={'#e0e0e0'}
                                strokeWidth={0}
                            />
                        </Layer>
                        <Layer>
                            <Rect 
                                x={0}
                                y={this.state.stageHeight - 24}
                                width={this.state.stageWidth}
                                height={24}
                                fill={'#47426c'}
                                shadowColor={'#47426c'}
                                shadowBlur={4}
                                shadowOffsetX={0}
                                shadowOffsetY={0}
                            />
                            <Rect 
                                width={100}
                                height={14}
                                fill={'#d86597'}
                                x={this.padding}
                                y={this.state.stageHeight - 19}
                                draggable={true}
                                type={'scrollRect'}
                                dragBoundFunc={(pos) => {
                                    const currX = pos.x;
                                    const highBound = this.state.stageWidth - 24 - 100;
                                    pos.x = Math.min(Math.max(currX, this.padding), highBound);
                                    pos.y = this.state.stageHeight - 19;
                                    return pos;
                                }}
                                onDragMove={this.horizontalDragMove}
                            />
                            <Rect 
                                x={this.state.stageWidth - 24}
                                y={0}
                                width={24}
                                height={this.state.stageHeight}
                                fill={'#47426c'}
                                shadowColor={'#47426c'}
                                shadowBlur={4}
                                shadowOffsetX={0}
                                shadowOffsetY={0}
                            />
                            <Rect 
                                width={14}
                                height={100}
                                fill={'#d86597'}
                                y={this.padding}
                                x={this.state.stageWidth - 19}
                                draggable={true}
                                type={'scrollRect'}
                                dragBoundFunc={(pos) => {
                                    const currY = pos.y;
                                    const highBound = this.state.stageHeight - 24 - 100;
                                    pos.y = Math.min(Math.max(currY, this.padding), highBound);
                                    pos.x = this.state.stageWidth - 19;
                                    return pos;
                                }}
                                onDragMove={this.verticalDragMove}
                            />
                        </Layer>
                    </Stage>
                </div>
            </div>
        );
    }

}




const mapStateToProps = state => ({
    sections: state.sections,
    isPlaying: state.playerInfo.isPlaying
});


export default connect(
    mapStateToProps,
    {
        addNote: ActionCreators.addNote,
        removeNote: ActionCreators.removeNote,
        closeWindow: ActionCreators.closeWindow
    }
)(PianoRoll);




/*

improvements to be made to piano roll


no particular order




1. Bug when using pencil tool needs to be fixed. It sometimes isn't letting notes be
added that should be valid, most likely an error in the note validation steps. 





||DONE|| 2. Scrollbars need to be updated to match the looks and functionality of the composer
scrollbars. 





3. Add a piano to the left of the piano roll, such that the user can click a key
on the piano to sample that note. In order for the piano roll component to directly
trigger a note on the instrument rather than having to go through redux and the
audio engine, store a global variable on the window that is a dictionary where each
key is the id of an instrument in use, and the corresponding value is a reference
to instrument in memory. That way the piano roll can just grab the reference and 
set a triggerAttackRelease on demand, since the piano roll knows its instrument id. 
On second thoughts, does it? If the piano roll only knows the channel id, maybe use
the channel ids for the dictionary and add a getter method to the channel that lets
the piano roll access the current instrument for that channel.



drawing the piano

draw a series of Rects along the left hand side 

Rects will be 48px wide, 16px tall

Each rect will be assigned a note from the notes array, as well  as a type attr
of 'pianoKeyRect'

If the note is a sharp note, give the piano key a dark color, otherwise it gets a
light color. To work this out - noteString.includes('#') 

For now, just add an onClick to each key that logs its notes







4. Fix weird behaviours arising when the scrollbars are used whilst the pencil tool 
is active - the mouseup event is still firing which causes a note to be drawn when
it shouldn't be. 





5. Modify the behaviour of the pencil tool - if the distance between mousedown and
mouseup doesn't meet some minimum note duration requirement, say a 32nd note, we'll 
just create a 32nd note automatically.





6. When you click on a pre-existing note it doesn't automatically delete it, it 
just highlights it. You can delete it with a dedicated delete button, or a keyboard
shortcut. You can also copy it to be pasted later.




7. When a note (or multiple notes, see next point) is/are selected, pressing the up
arrow will move the note up be a semitone, down arrow down by a semitone. The right
arrow will move the note along to the next step it can occupy according to the 
current quantize/snap, the left key will move it back to the previous one.  





8. Multi-select of notes - either hold down the control key while selecting, or,
with the pointer tool, click and drag along the canvas to select all notes that 
fall within the area that you specified. 





9. Copy pasting will be linked to where you are on currently on the transport
timeline. Will have to manually ensure that the current spot on the timeline 
is within the current section, and if not then prevent the user from pasting, to
avoid weirdness. 





10. Add a transport section to the top of the piano roll canvas - similar in
appearance and functionality to the one in the composer component. If performance
permits, add a seeker line as well that shows where abouts the track is within the 
section. 




11. Implement note velocity - have a section at the bottom of the canvas where users 
can pull a notes velocity up/down.




12. Neaten up the piano roll component in general. It's probably a good idea to do
this before moving onto the more advanced features in this list. 










*/