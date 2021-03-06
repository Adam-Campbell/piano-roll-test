import React, { Component } from 'react';
import { connect } from 'react-redux';
import * as ActionCreators from '../../actions';
import { throttle, debounce } from 'lodash';
import Tone from 'tone';
import Composer from './Composer';
import { 
    createCopiedSectionsDataStructure,
    findEarliestStartTime,
    createGridLinesArray,
    createSectionRectsArray,
    createSectionObject
} from './ComposerUtils';
import { 
    findOverlapAlongAxis,
    addOrRemoveElementFromSelection,
    getWholeBarsFromString,
    adjustForScroll,
    transportPositionStringToSixteenths,
    generateId
} from '../../sharedUtils';
import { toolTypes } from '../../constants';

export class ComposerContainer extends Component {

    constructor(props) {
        super(props);
        const windowWidth = document.documentElement.clientWidth;
        const windowHeight = document.documentElement.clientHeight;
        this.scrollPadding = 10;
        this.stageRef = React.createRef();
        this.gridLayerRef = React.createRef();
        this.sectionsLayerRef = React.createRef();
        this.transportLayerRef = React.createRef();
        this.seekerLayerRef = React.createRef();
        this.seekerLineRef = React.createRef();
        this.rAFRef = null;
        this.updateStageDimensions = debounce(this._updateStageDimensions, 50);
        this.state = {
            currentlySelectedChannel: null,
            currentlySelectedSections: [],
            currentlyCopiedSections: {},
            scrollBarActive: false,
            mouseDownPosX: 0,
            mouseDownPosY: 0,
            trackInfoMenuTopScroll: 0,
            transportPosition: 0,
            stageWidth: windowWidth - 220,
            stageHeight: windowHeight - 48,
        };
    }

    componentDidMount() {
        window.addEventListener('resize', this.updateStageDimensions);
        this._updateStageDimensions();
    }

    componentDidUpdate(prevProps, prevState, snapshot) {
        /*
            const isActivelyPlaying = this.props.isPlaying && !this.props.isPaused
            if isActivelyPlaying we want to restart the raf process

            else if it was previously playing but now it is paused we just want to cancel the raf process

            else if it was previously playing but now it is stopped then we want to cancel the raf process
            and force the seeker line back to the start.

        */
        if (prevProps.isPlaying !== this.props.isPlaying || 
            prevProps.isPaused !== this.props.isPaused
        ) {
            
            if (this.props.isPlaying) {
                requestAnimationFrame(this.repaintSeekerLayer);
            } else if (this.props.isPaused) { 
                cancelAnimationFrame(this.rAFRef);
            } else {
                cancelAnimationFrame(this.rAFRef);
                this.seekerLineRef.current.x(0);
                this.seekerLayerRef.current.batchDraw();
            }
        }
    }

    _updateStageDimensions = () => {
        const windowWidth = document.documentElement.clientWidth;
        const windowHeight = document.documentElement.clientHeight;
        const transportContainerNode = document.querySelector('.transport__container');
        const transportHeight = transportContainerNode.getBoundingClientRect().height;
        this.setState({
            stageWidth: windowWidth - 220,
            stageHeight: windowHeight - transportHeight
        });
    }

    get canvasHeight() {
        return Math.max(4, this.props.channels.length) * 70 + 40;
    }

    get canvasWidth() {
        return 200 * 48;
    }

    /**
     * Works out the next x position for the seeker line according to the current transport position, 
     * then updates the seeker line with that x position and repaints the seeker layer. 
     */
    repaintSeekerLayer = () => {
        const newXPos = transportPositionStringToSixteenths(Tone.Transport.position) * 3;        
        this.seekerLineRef.current.x(newXPos);
        this.seekerLayerRef.current.batchDraw();
        this.rAFRef = requestAnimationFrame(this.repaintSeekerLayer);
    }

    /**
     * Handles click events on the stage which have not been caught by event listeners on any of the layers above. 
     * Delegates to other functions as necessary. 
     * @param {object} e - the event object.
     */
    handleStageClick = (e) => {
        // if scroll bar is active, make it inactive and return
        if (this.state.scrollBarActive) {
            this.setState({ scrollBarActive: false });
            return;
        }
        // grab x and y positions for click
        const rawXPos = e.evt.layerX;
        const rawYPos = e.evt.layerY;
        // adjust for scroll
        const xPosWithScroll = adjustForScroll({ raw: rawXPos, scroll: this.gridLayerRef.current.attrs.x });
        const yPosWithScroll = adjustForScroll({ raw: rawYPos, scroll: this.gridLayerRef.current.attrs.y });
        
        // if pencil is active then we don't want to do anything in the click event, everything is
        // handled by mouseDown and mouseUp events. 
        if (this.props.toolType === toolTypes.cursor) {
            const newSectionObject = createSectionObject({
                x: xPosWithScroll,
                y: yPosWithScroll,
                allChannels: this.props.channels,
                numberOfBars: 1
            });
            if (newSectionObject) {
                this.props.addSection(
                    newSectionObject,
                    newSectionObject.id,
                    newSectionObject.channelId
                );
            }
        }

    }

    /**
     * Handles mouseDown events on the stage which have not been caught by event listeners on any of the layers
     * above. Delegates to other functions as necessary. 
     * @param {object} e - the event object
     */
    handleStageMouseDown = (e) => {
        if (this.state.scrollBarActive) {
            this.setState({ scrollBarActive: false });
            return;
        }
        if (this.props.toolType === toolTypes.cursor) return;
        // As long as the mouse down event occurred on the main part of the canvas, update mouseDownPosX and
        // mouseDownPosY with values derived from the event. If the event occurred on the transport section
        // of the canvas, null out the values in state. 
        if (e.evt.layerY >= 40) {
            this.setState({
                mouseDownPosX: adjustForScroll({ raw: e.evt.layerX, scroll: this.gridLayerRef.current.attrs.x }),
                mouseDownPosY: adjustForScroll({ raw: e.evt.layerY, scroll: this.gridLayerRef.current.attrs.y})
            });
        } else {
            this.setState({
                mouseDownPosX: null,
                mouseDownPosY: null
            });
        }
    }

    /**
     * Handles mouseUp events on the stage which have not been caught by event listeners on any of the layers
     * above. Delegates to other functions as necessary. 
     * @param {object} e - the event object
     */
    handleStageMouseUp = (e) => {
        // If scrollBar is active, just make it inactive and return
        if (this.state.scrollBarActive) {
            this.setState({ scrollBarActive: false });
            return;
        }
        const rawYPos = e.evt.layerY;
        // return early if y coord of event is less than 40 (meaning the event occurred within the transport
        // section of canvas) or the toolType is cursor (meaning nothing should happen on a mouseUp event).
        if (rawYPos < 40 || this.props.toolType === toolTypes.cursor) { 
            return; 
        }

        const mouseUpPosX = adjustForScroll({ raw: e.evt.layerX, scroll: this.gridLayerRef.current.attrs.x });
        const mouseUpPosY = adjustForScroll({ raw: e.evt.layerY, scroll: this.gridLayerRef.current.attrs.y });
        const targetIsSection = e.target.attrs.type && e.target.attrs.type === 'section';
        // delegate to handlePencilToolNoteCreation() if the pencil tool is active, the target of the mouseUp
        // event is not a section rectangle, and if the preceeding mouseDown event occurred within a 'legal' 
        // part of the canvas (if it didn't then mouseDownPosY will be null).
        if (this.props.toolType === toolTypes.pencil && !targetIsSection && this.state.mouseDownPosY !== null) {
            this.handlePencilNoteCreation(mouseUpPosX);
            return;
        }
        // if the pointer tool is active and the shift key is currently held down, then delegate to
        // handlePointerToolMultiSelect().
        if (this.props.toolType === toolTypes.selection) {
            this.handlePointerToolMultiSelect({
                verticalSelectionBound1: this.state.mouseDownPosY,
                verticalSelectionBound2: mouseUpPosY,
                horizontalSelectionBound1: this.state.mouseDownPosX,
                horizontalSelectionBound2: mouseUpPosX
            });
        }
    }

    /**
     * Handles the creation of a note via the pencil tool
     * @param {number} mouseUpPosX - the x coordinate for the mouseUp event being used to construct the new
     * section. It should already be adjusted for any scrolling that has occurred on the canvas before it is
     * passed to this function. 
     */
    handlePencilNoteCreation = (mouseUpPosX) => {
        const { mouseDownPosX, mouseDownPosY } = this.state;
        const sectionStartAsNumber = Math.floor(mouseDownPosX / 48);
        const sectionEndAsNumber = Math.round(mouseUpPosX / 48);
        const sectionLengthInBars = sectionEndAsNumber - sectionStartAsNumber > 1 ?
                                    sectionEndAsNumber - sectionStartAsNumber : 1;

        const newSectionObject = createSectionObject({
            x: mouseDownPosX,
            y: mouseDownPosY,
            allChannels: this.props.channels,
            numberOfBars: sectionLengthInBars
        });
        if (newSectionObject) {
            this.props.addSection(
                newSectionObject,
                newSectionObject.id,
                newSectionObject.channelId
            );
        }
    }

    /**
     * Handles the creation of a selection range whilst using the pointer tool.
     * @param {number} verticalSelectionBound1 - a vertical bound of the selection
     * @param {number} verticalSelectionBound2 - the other vertical bound of the selection
     * @param {number} horizontalSelectionBound1 - a horizontal bound of the selection
     * @param {number} horizontalSelectionBound2 - the other horizontal bound of the selection
     */
    handlePointerToolMultiSelect = (optionsObject) => {
        const { 
            verticalSelectionBound1, 
            verticalSelectionBound2, 
            horizontalSelectionBound1,
            horizontalSelectionBound2
        } = optionsObject;

        // selectedSectionIds will hold the ids of any sections which meet the necessary criteria once we
        // have examined all of them. 
        let selectedSectionsIds = [];
        // Ascertain which horizontal bound is which, same for the vertical bounds. 
        const selectionLeftBound = Math.min(horizontalSelectionBound1, horizontalSelectionBound2);
        const selectionRightBound = Math.max(horizontalSelectionBound1, horizontalSelectionBound2);
        const selectionTopBound = Math.min(verticalSelectionBound1, verticalSelectionBound2);
        const selectionBottomBound = Math.max(verticalSelectionBound1, verticalSelectionBound2);
        
        // Loop through all of the sections in the app state.
        for (let sectionId in this.props.sections) {
            const section = this.props.sections[sectionId];
            // Now derive sectionLeftBound, sectionRightBound, sectionTopBound, sectionBottomBound.
            const channelIndex = this.props.channels.findIndex(channel => channel.id === section.channelId);
            const sectionTopBound = (channelIndex * 70) + 40;
            const sectionBottomBound = sectionTopBound + 70;
            const sectionLeftBound = getWholeBarsFromString(section.start) * 48;
            const sectionRightBound = sectionLeftBound + (section.numberOfBars * 48);
            // Determine whether there is any horizontal overlap
            const isInHorizontalRange = findOverlapAlongAxis({
                elementALowerBound: selectionLeftBound,
                elementAUpperBound: selectionRightBound,
                elementBLowerBound: sectionLeftBound,
                elementBUpperBound: sectionRightBound
            });
            // Determine whether there is any vertical overlap
            const isInVerticalRange = findOverlapAlongAxis({
                elementALowerBound: selectionTopBound,
                elementAUpperBound: selectionBottomBound,
                elementBLowerBound: sectionTopBound,
                elementBUpperBound: sectionBottomBound
            });
            // If there is both horizontal and vertical overlap, push this sections id onto the 
            // selectedSectionsIds array.
            if (isInHorizontalRange && isInVerticalRange) {
                selectedSectionsIds.push(section.id);
            }
        }
        // Update state with the selectedSectinsIds array, even if it is empty.
        this.setState({
            currentlySelectedSections: selectedSectionsIds
        });
    }

    updateCurrentlySelectedSections = (newSectionsArray) => {
        this.setState({
            currentlySelectedSections: newSectionsArray
        });
    }

    /**
     * Handles keyDown events that take place anywhere in the component, as long as they haven't already been
     * dealt with by another event listener.
     * @param {object} e - the event object
     */
    handleKeyDown = (e) => {
        //console.log('handleKeyDown on the Composer was called');
        //console.log(e);
        
        // handle deletion
        if (e.key === 'Delete') {
            e.stopPropagation();
            this.handleSectionDeletion();
        }

        // handle copying
        if (e.key === 'c' && e.ctrlKey === true) {
            e.stopPropagation();
            this.handleCopying();
        }

        // handle pasting
        if (e.key === 'v' && e.ctrlKey === true) {
            e.stopPropagation();
            this.handlePasting();
        }

        // handle clearing selection
        if (e.key === 'd' && e.ctrlKey) {
            e.stopPropagation();
            e.preventDefault();
            this.setState({
                currentlySelectedSections: []
            });
        }
    }

    /**
     * Updates the currentlySelectedChannel property in state.
     * @param {string} channelId - the channel id to update to. 
     */
    updateSelectedChannel = (channelId) => {
        this.setState({
            currentlySelectedChannel: channelId
        });
    }

    /**
     * Updates the trackInfMenuTopScroll property in state, which is used to manipulate the scroll of the
     * non canvas part of this component such that it stays in sync with the canvas.
     */
    updateTrackInfoMenuTopScroll = (newScrollAmount) => {
        this.setState({
            trackInfoMenuTopScroll: newScrollAmount
        });
    }

    /**
     * Handles the deletion of sections.
     */
    handleSectionDeletion = () => {
        for (let sectionId of this.state.currentlySelectedSections) {
            this.removeOneSection(sectionId);
        }
        this.setState({
            currentlySelectedSections: []
        });
    }

    /**
     * Dispatches the action to remove one section, utilised by the handleSectionDeletion method. 
     * @param {string} sectionId - the id of the section to be removed.
     */
    removeOneSection = (sectionId) => {
        const channelId = this.props.sections[sectionId].channelId;
        this.props.removeSection(sectionId, channelId);
    }

    /**
     * Handles the copying of the current section selection.
     */
    handleCopying = () => {
        const copiedSections = createCopiedSectionsDataStructure({
            currentSelectionState: this.state.currentlySelectedSections,
            allSections: this.props.sections,
            allChannels: this.props.channels
        });
        this.setState({
            currentlyCopiedSections: copiedSections
        }); 
    }

    /**
     * Handles the pasting of the section data that was previously copied.
     */
    handlePasting = () => {
        const { sectionObjects, lowestIndex } = this.state.currentlyCopiedSections;
        // return early if nothing has been copied
        if (!sectionObjects.length) {
            return;
        }
        const currentBar = getWholeBarsFromString(Tone.Transport.position);
        // work out the index of the currently selected channel, or if there is no such channel, just use 
        // index 0.
        let currentChannelIndex;
        if (this.state.currentlySelectedChannel) {
            currentChannelIndex = this.props.channels.findIndex(channel => {
                return channel.id === this.state.currentlySelectedChannel;
            });
        } else {
            currentChannelIndex = 0;
        }
        // find the earliest start time.
        const earliestStartTime = findEarliestStartTime(sectionObjects);
        // loop over the section objects and for each create a new section object to paste, adjusted
        // as necessary, and then dispatch the action to add that section.
        for (let section of sectionObjects) {
            const startDiff = getWholeBarsFromString(section.start) - getWholeBarsFromString(earliestStartTime);
            const adjustedStartString = `${currentBar+startDiff}:0:0`;
            // work out the adjusted index for the channel that this section will be pasted to and grab
            // that channels id.
            const adjustedIndex = section.channelIndex - lowestIndex + currentChannelIndex;
            if (adjustedIndex < this.props.channels.length) {
                const channelId = this.props.channels[adjustedIndex].id;
                const notesArray = section.notes.map(note => {
                    return {
                        ...note,
                        _id: generateId()
                    }
                });
                const newSectionObject = {
                    id: generateId(),
                    channelId: channelId,
                    notes: notesArray,
                    start: adjustedStartString,
                    numberOfBars: section.numberOfBars
                };
                this.props.addSection(
                    newSectionObject, 
                    newSectionObject.id,
                    newSectionObject.channelId
                );
            }
        }

    }

    enterScrollBarActiveState = () => {
        this.setState({
            scrollBarActive: true
        });
    }

    render() {
        const gridLinesArray = createGridLinesArray({
            canvasHeight: this.canvasHeight,
            canvasWidth: this.canvasWidth,
            channelsArrayLength: this.props.channels.length
        });
        const sectionRectsArray = createSectionRectsArray({
            allChannels: this.props.channels,
            allSections: this.props.sections
        });

        return <Composer 
            stageRef={this.stageRef}
            gridLayerRef={this.gridLayerRef}
            sectionsLayerRef={this.sectionsLayerRef}
            transportLayerRef={this.transportLayerRef}
            seekerLayerRef={this.seekerLayerRef}
            seekerLineRef={this.seekerLineRef}
            canvasWidth={this.canvasWidth}
            canvasHeight={this.canvasHeight}
            stageWidth={this.state.stageWidth}
            stageHeight={this.state.stageHeight}
            scrollPadding={this.scrollPadding}
            gridLinesArray={gridLinesArray}
            sectionRectsArray={sectionRectsArray}
            handleKeyDown={this.handleKeyDown}
            handleStageClick={this.handleStageClick}
            handleStageMouseDown={this.handleStageMouseDown}
            handleStageMouseUp={this.handleStageMouseUp}
            handleSectionClick={this.handleSectionClick}
            handleSectionDoubleClick={this.handleSectionDoubleClick}
            trackInfoMenuTopScroll={this.state.trackInfoMenuTopScroll}
            channels={this.props.channels}
            currentlySelectedSections={this.state.currentlySelectedSections}
            currentlySelectedChannel={this.state.currentlySelectedChannel}
            updateSelectedChannel={this.updateSelectedChannel}
            enterScrollBarActiveState={this.enterScrollBarActiveState}
            updateTrackInfoMenuTopScroll={this.updateTrackInfoMenuTopScroll}
            updateCurrentlySelectedSections={this.updateCurrentlySelectedSections}
            openWindow={this.props.openWindow}
            selectionToolActive={this.props.toolType === toolTypes.selection}
        />
    }
}

const mapStateToProps = state => ({
    channels: state.main.present.channels,
    sections: state.main.present.sections,
    isPlaying: state.playerStatus.isPlaying,
    isPaused: state.playerStatus.isPaused,
    toolType: state.settings.toolType
});

export default connect(
    mapStateToProps,
    {
        addChannel: ActionCreators.addChannel,
        removeChannel: ActionCreators.removeChannel,
        addSection: ActionCreators.addSection,
        removeSection: ActionCreators.removeSection,
        openWindow: ActionCreators.openWindow
    }
)(ComposerContainer);