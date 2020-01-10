import {
  AfterViewInit,
  ChangeDetectorRef,
  Component,
  ElementRef,
  EventEmitter,
  OnDestroy,
  OnInit, Output,
  ViewChild,
} from '@angular/core';
import * as vis from 'vis';
import { DataGroup, DataItem, IdType, Timeline, TimelineOptions } from 'vis';
import * as moment from 'moment';
import { LabelsService } from 'src/app/labels/labels.service';
import { CurrentProjectService } from '../current-project.service';
import { VideoService } from '../../video/video.service';
import { Subscription } from 'rxjs';
import { IMediaSubscriptions } from 'videogular2/src/core/vg-media/i-playable';
import { Hotkey, HotkeysService } from 'angular2-hotkeys';
import { ProjectModel } from '../../models/project.model';
import { Time } from './utilities/time';
import { TimelineData } from './timeline.data';
import _ from "lodash";
import { pairwise, startWith } from 'rxjs/operators';
import { LabelCategoryModel } from '../../models/labelcategory.model';
import { CurrentToolService } from '../project-toolbox.service';
import * as hyperid from 'hyperid';
import { CanvasService } from '../../canvas/canvas.service';

@Component({
  selector: 'app-timeline',
  templateUrl: './timeline.component.html',
  styleUrls: ['./timeline.component.scss']
})
export class TimelineComponent implements OnInit, AfterViewInit, OnDestroy {

  @ViewChild('timeline_visualization') timelineVisualization: ElementRef;

  loading = true;
  private project: ProjectModel;
  private instance = hyperid();


  private timeline: Timeline;

  // noinspection SpellCheckingInspection
  // noinspection JSUnusedGlobalSymbols
  private options = {
    width: '100%',
    min: Time.seconds(0),
    start: Time.seconds(0),
    end: Time.seconds(15),
    max: Time.seconds(98), // todo
    moment: function (date) {
      return moment(date).utc();
    },
    format: {
      minorLabels: {
        millisecond: 'ss.SSS',
        second: 'HH:mm:ss',
        minute: 'HH:mm:ss',
        hour: 'HH:mm',
        weekday: 'HH:mm',
        day: 'HH:mm',
        week: 'HH:mm',
        month: 'HH:mm',
        year: 'HH:mm'
      },
      majorLabels: {
        second: 'HH:mm:ss',
        minute: 'HH:mm:ss',
        hour: '',
        weekday: '',
        day: '',
        week: '',
        month: '',
        year: ''
      }
    },
    groupTemplate: (group: DataGroup) => {
      if (group) {

        const overarchingContainer = document.createElement('div');
        overarchingContainer.className = 'clr-row top-margin';

        const containerLeft = document.createElement('div');
        containerLeft.className = 'clr-col-6';

        const containerRight = document.createElement('div');
        containerRight.className = 'clr-col-6';

        const categoryContainer = document.createElement('div');
        categoryContainer.className = 'btn btn-link';

        const categoryLabel = document.createElement('label');
        categoryLabel.innerHTML = group['category'];
        categoryLabel.addEventListener('click', () => {
          this.toolBoxService.triggerToolBox(false);
          this.labelsService.addLabel(JSON.parse(localStorage.getItem('currentSession$'))['user']['id'],group['categoryId'], this.userRole);
        });

        categoryContainer.append(categoryLabel);

        const container = document.createElement('div');
        container.className = 'checkbox btn';

        const input = document.createElement('input');
        input.type = 'checkbox';
        input.id = `checkbox_${group.id}`;
        input.addEventListener('change', () => {
          this.toolBoxService.triggerToolBox(false);
          this.checkboxChange.emit({id: group.id, checked: input.checked});
        });

        const label = document.createElement('label');
        label.setAttribute('style', 'padding-right: 2em;');
        label.setAttribute('for', `checkbox_${group.id}`);
        label.innerHTML = group.content;

        container.prepend(input);
        container.append(label);

        containerLeft.appendChild(categoryContainer);
        containerRight.appendChild(container);

        overarchingContainer.appendChild(containerLeft);
        overarchingContainer.appendChild(containerRight);
        return overarchingContainer;
      }
    },
    multiselect: false,
    editable: true,
    onAdd: (item, callback) => {
      console.log('onAdd', item);
      console.log(callback);
      item.id = 'asd4234asfscsd';
      item.content = '';
      item.editable = false;
      item.title = "Click to add tracking information for this instant";
      //callback(item); // send back adjusted new item
    },
    onMove: (item, callback) => {
      console.log('onMove', item);
      callback(item);
    },
    onMoving: (item, callback) => {
      console.log('onMoving', item);
      callback(item);
    },
    onUpdate: (item, callback) => {
      console.log('onUpdate', item);
      callback(item);
    },
    onRemove: (item, callback) => {
      console.log('onRemove', item);
      callback(item);
    },
    tooltipOnItemUpdateTime: {
      template: item => {
        const fstart = Time.formatDatetime(item.start);
        const fend = Time.formatDatetime(item.end);
        return `Start: ${fstart}<br>End:${fend}`;
      }
    },
    tooltip: {
      followMouse: true,
      overflowMethod: 'cap'
    }
  };

  private timelineData: TimelineData = new TimelineData();
  //To maintain categories, since groups contain label information.
  private labelCategories: LabelCategoryModel[] = [];
  private customTimeId: IdType;
  private subscription: Subscription;
  private currentTime = 0;

  private checkboxChange = new EventEmitter<{ id: IdType, checked: boolean }>();
  private userRole: string;

  constructor(private projectService: CurrentProjectService,
              private labelsService: LabelsService,
              private videoService: VideoService,
              private hotkeyService: HotkeysService,
              private changeDetectorRef: ChangeDetectorRef,
              private toolBoxService: CurrentToolService,
              private canvasService: CanvasService) {
  }

  ngOnInit(): void {
    this.subscription = this.projectService.getCurrentProject$()
      .subscribe(project => {
        if (project) {
          this.project = project;
          this.userRole = this.projectService.findUserRole(project, JSON.parse(localStorage.getItem('currentSession$'))['user']['id']);
          this.labelsService.getLabelCategories()
            .then((labelCategories: LabelCategoryModel[]) => {
              labelCategories.map(labelCategory => {
                let labelIds = labelCategory.labels.map(x => {return x["_id"]});
                this.labelsService.getSegments(labelIds);
                this.labelsService.getMarkers(labelIds);
                this.timelineData.addGroups(labelCategory.labels.map(x => ({id: x["_id"], content: x.name, category: labelCategory.name, categoryId: labelCategory.id})));
                this.labelCategories.push(labelCategory);
              });
            });
        }
      });

    this.subscription.add(this.canvasService.getUpdatedTrackerLabelId$().subscribe(next => {
      if(next && next!="") {
        this.timelineData.completeMarkerItems(next);
      }
    }));

    this.observeLabels();
    this.observeSegments();

    this.subscription.add(this.videoService.playerReady
      .subscribe(event => {
        const api = event.api;
        const index = event.index;
        if (api && index === 0) {
          const subscriptions: IMediaSubscriptions = api.subscriptions;
          this.subscription.add(subscriptions.canPlay.subscribe(() => {this.updateCurrentTime(Time.seconds(api.currentTime));}));
          this.subscription.add(subscriptions.timeUpdate.subscribe(() => {this.updateCurrentTime(Time.seconds(api.currentTime));}));
          this.subscription.add(subscriptions.durationChange.subscribe(() => {this.setMax(Time.seconds(api.duration));}));
        }
      }));

    this.subscription.add(this.checkboxChange
      .pipe(
        startWith({id: undefined, checked: false}),
        pairwise()
      )
      .subscribe(e => {
        const prev = e[0];
        const curr = e[1];

        if (prev && prev.id === undefined) {
          this.timelineData.startRecording(curr.id, this.currentTime);
        } else if (curr.checked) {
          this.timelineData.startRecording(curr.id, this.currentTime);
        } else if (!curr.checked) {
          this.stopRecording(curr);
        }
      }));

  }

  ngAfterViewInit() {
    const container = this.timelineVisualization.nativeElement;
    // @ts-ignore
    this.timeline = new vis.Timeline(container, this.timelineData.items, this.timelineData.groups, this.options);
    this.customTimeId = this.timeline.addCustomTime(Time.seconds(1), 'currentPlayingTime');
    this.timeline.setCustomTimeTitle('seeker', this.customTimeId);


    this.timeline.on('timechanged', properties => {
      const videoSeek = Time.dateToTotalCentiSeconds(properties.time);
      this.videoService.seekTo(videoSeek);
    });

    this.timeline.on('select', properties => {
      let item = this.timelineData.items.get(properties.items)[0];
      if(item && item['segment']) {
        let label = this.timelineData.getGroup(item.group);
        this.checkForTracking(label['categoryId']);
        this.updateCurrentTime(Number(item.start));
        this.videoService.seekTo(Number(item.start)/1000);
        this.timeline.redraw();
        this.toolBoxService.triggerCanvas(item['trackerId']);
      }
      else {
        this.toolBoxService.triggerToolBox(false);
        this.toolBoxService.triggerCanvas(null);
      }
    });

    this.timelineData.items.on('remove', (event, properties) => {
      if (event === 'remove') {
        const ids = properties.items;
        this.labelsService.deleteSegments(ids).then((result: string[]) => {
          console.log("deleted segment: " + result);
          this.timelineData.items.remove(result);
        }, function(error) {
          console.log("error: "+ error);
        });
      }
    });

    this.loading = false;
    this.changeDetectorRef.detectChanges();

    this.registerHotkeys();

    // force a timeline redraw, because sometimes it does not detect changes
    setTimeout(() => {
      this.timeline.redraw();
      let elements = document.getElementsByClassName('vis-inner');

      // @ts-ignore
      for (let item of elements) {
        item.setAttribute('style', 'display: block;');
      }
    }, 250);
  }

  ngOnDestroy(): void {
    if (this.timeline) {
      this.timeline.destroy();
    }
    if (this.subscription) {
      this.subscription.unsubscribe();
    }
  }

  private stopRecording(curr) {
    this.timelineData.stopRecording(curr.id)
      .then((response: { id: IdType, updateExisting: boolean }) => {
        const item = this.timelineData.items.get(response.id);
        if (item && item.start != item.end) {
          let segment: any;
          segment = {
            hyperid: item.id,
            group: item.group,
            start: item.start,
            end: item.end,
            authorRole: this.userRole,
            authorId: JSON.parse(localStorage.getItem('currentSession$'))['user']['id'],
          };
          segment = response.updateExisting ? item : segment;
          let checkForMerges = this.updateRequired(this.timelineData.findItemsByOptions('group', item.group), segment, response.updateExisting);
          let start: number;
          let end: number;
          if (checkForMerges[0]) {
            this.handleSegmentMerge(checkForMerges);
            start = checkForMerges[2];
            end = checkForMerges[3];
          } else {
            start = segment.start;
            end = segment.end;
            this.createNewSegment(segment, start, end);
          }
        }
      }, (msg) => {
        console.log('an error occurred while adding a segment:' + msg);
      });
  }

  private createNewSegment(segment: any, start: number, end: number) {
    this.labelsService.addSegment(segment).then((response) => {
      console.log('segment added' + response);
      this.timelineData.removeItem(segment.hyperid);
      segment.id = response;
      this.timelineData.updateItem(segment);
      this.addMarkersForSegment(segment, start, end);
    }, function(err) {
      console.log('an error occured while adding a segment');
    });
  }

  private handleSegmentMerge(checkForMerges) {
    this.labelsService.mergeSegments(checkForMerges[1], checkForMerges[2], checkForMerges[3]).then(() => {
      let segment = this.timelineData.getItem(checkForMerges[1][0]);
      segment.start = checkForMerges[2];
      segment.end = checkForMerges[3];
      this.timelineData.updateItem(segment);
      this.addMarkersForSegment(segment, checkForMerges[2], checkForMerges[3]);
      for (let j = 1; j < checkForMerges[1].length; j++) {
        this.timelineData.removeItem(checkForMerges[1][j]);
        this.timelineData.removeMarkersBySegmentId(checkForMerges[1][j]);
      }
      this.timeline.redraw();
    }, () => {
      console.log('an error occured while merging the segment');
    });
  }

  updateCurrentTime(millis: number) {
    // console.log(millis);
    this.currentTime = millis;

    this.timeline.setCustomTime(millis, this.customTimeId);
    const start = this.timeline.getWindow().start.getTime();
    const end = this.timeline.getWindow().end.getTime();

    const delta = 3 * (end - start) / 4; // center
    if (millis < start || end < millis + delta) {
      this.timeline.moveTo(millis, {animation: false});
      // this.timeline.moveTo(millis + (end - start) - (end - start) / 6);
    }

    this.timelineData.updateRecordings(millis);
  }

  private observeLabels() {
    this.subscription.add(this.labelsService.newLabels$().subscribe(newLabel => {
      if (newLabel) {
        let category: LabelCategoryModel = this.labelCategories.find(value => value.id == newLabel['categoryId'] );
        if(category!= null) {
          category.labels.push(newLabel);
          const group = {id: newLabel.id, content: newLabel.name, category: category.name, categoryId: category.id};
          this.timelineData.addGroup(group);
          this.timelineData.sortByCategories();
        }
      }
    }));

    this.subscription.add(this.labelsService.newLabelCategories$().subscribe(newLabelCategories => {
      if (newLabelCategories) {
        const group = {id: newLabelCategories["labels"][0]["_id"], content: newLabelCategories["labels"][0]["name"], category: newLabelCategories.name, categoryId: newLabelCategories.id};
        this.timelineData.addGroup(group);
        this.labelCategories.push(newLabelCategories);
      }
    }));

    this.subscription.add(this.labelsService.removedLabels$().subscribe(removed => {
      if (removed) {
        this.timelineData.removeGroup(removed.id);
      }
    }));

    this.subscription.add(this.labelsService.removedLabelCategories$().subscribe(removed => {
      if (removed) {
        let removedCategory: LabelCategoryModel = this.labelCategories.find((labelCategory) => { return labelCategory.id === removed.id;});
        this.timelineData.deleteGroupCategory(removedCategory.id);
        removedCategory.labels.map( label => this.timelineData.removeGroup(label["_id"]));
        this.labelCategories.filter(item => item !== removedCategory);
      }
    }));

    this.subscription.add(this.labelsService.editedLabels$().subscribe(changed => {
        if (changed) {
          this.timelineData.updateGroup({id: changed.id, content: changed.change});
        }
      })
    );

    this.subscription.add(this.labelsService.editedLabelCategories$().subscribe(changed => {
        if (changed) {
          this.timelineData.updateGroupCategory(changed.change, changed.id);
          let category: LabelCategoryModel = this.labelCategories.find( item => item.id === changed.id);
          category.name = changed.change;
          category.labels.map( label => label.name = changed.change + '_' + label.name.split('_')[1]);
          this.timeline.redraw();
        }
      })
    );
  }

  private observeSegments() {
    this.subscription.add(
      this.labelsService.getSegments$()
        .subscribe(
          xs => this.timelineData.items.add(xs.map(x => ({
            id: x.id,
            content: '',
            group: x.labelId,
            start: x.start,
            end: x.end
          })))
        )
    );
    this.subscription.add(
      this.labelsService.getMarkers$().subscribe(
        marker => {
          this.addMarkertoTimeline(marker);
        }
      )
    );

    this.subscription.add(
      this.labelsService.newMarkers$().subscribe(
        marker => {
          this.addMarkertoTimeline(marker);
        }
      )
    );

    this.subscription.add(
      this.labelsService.deleteMarkers$().subscribe(
        ids => {
          this.removeMarkerFromTimeline(ids);
        }
      )
    );
  }

  private addMarkertoTimeline(marker) {
    this.timelineData.items.add(marker.map(x => ({
      id: x.id? x.id: x["_id"],
      content: '',
      group: x.labelId,
      start: x.start,
      editable: false,
      title: x.completed ? 'Click to update tracking data' : 'Click to add tracking data',
      style: x.completed ? 'cursor: pointer; color: green; background-color: green' : 'cursor: pointer; color: red; background-color: red',
      segment: x.segmentId,
      trackerId: x.trackerId,
      cursor: "pointer"
    })));
  }

  private removeMarkerFromTimeline(marker) {
    this.timelineData.removeItem(marker.map(x => x.toString()));
  }

  private registerHotkeys() {
    const hotkeys = [];
    for (let i = 0; i < 9; ++i) {
      const hotkey = new Hotkey(
        `${i + 1}`,
        (): boolean => {
          const ids: IdType[] = this.timelineData.getGroupIds();
          const id = ids[i];
          const checkbox = document.getElementById(`checkbox_${id}`);
          if (checkbox) {
            checkbox.click();
          }
          return false;
        },
        undefined,
        `Toggle recording of the ${i + 1} label`);
      hotkeys.push(hotkey);
    }
    this.hotkeyService.add(hotkeys);

    const del = new Hotkey(
      `del`,
      (): boolean => {
        setTimeout(() => this.deleteSelecion(), 0);
        return false;
      },
      undefined,
      `Delete selected segments`);

    this.hotkeyService.add(del);
  }

  private setMax(duration: number) {
    // @ts-ignore
    const newOptions: TimelineOptions = Object.assign({}, this.options);
    newOptions.max = duration;
    this.timeline.setOptions(newOptions);
  }

  private deleteSelecion() {
    const selection = this.timeline.getSelection();
    if (selection && selection.length > 0) {
      if (confirm('Are you sure you want to delete selected segments?')) {
        this.timelineData.items.remove(selection);
      }
    }
  }

  private checkForTracking(categoryId: string) {
    let category: LabelCategoryModel = this.labelCategories.find(value => value.id == categoryId );
    this.toolBoxService.triggerToolBox(category.isTrackable);
  }


  //TODO CHECK IF THIS SECTION IS ACTUALLY REQUIRED
  private updateRequired(items: DataItem[], currentItem: any, updateExisting: boolean) {
    if(updateExisting) return this.existingItemMerge(items, currentItem);
    else {
      return this.mergeItemsForNewSegment(items, currentItem, false);
    }
  }

  private mergeSegments(currentItem: any, items: DataItem[], existingUpdate: boolean) {
    let itemList = [];
    let start: number = currentItem.start;
    let end: number = currentItem.end;
    if(existingUpdate) itemList.push(currentItem.id);
    else {
      this.timelineData.items.remove(currentItem.hyperid);
    }
    items.forEach(segment => {
      let currentId = currentItem['id'] ? currentItem['id'] : currentItem['hyperid'];
      if (currentItem != segment && currentId != segment.id && (segment.start <= currentItem.end && segment.end >= currentItem.start)) {
        start = start < segment.start ? start : parseInt(segment.start.toString());
        end = end < segment.end ? parseInt(segment.end.toString()) : end;
        itemList.push(segment.id);
      }
    });
    return { itemList, start, end };
  }

  private existingItemMerge(items: DataItem[], currentItem: any) {
    if(items.length == 1) {
      return [true, [items[0].id], currentItem.start, currentItem.end];
    }
    return this.mergeItemsForNewSegment(items, currentItem, true);
  }

  private mergeItemsForNewSegment(items: DataItem[], currentItem: any, updateExisting: boolean) {
    if(items.length != 1)  {
      let { itemList, start, end } = this.mergeSegments(currentItem, items, updateExisting);
      if(itemList.length > 0) {
        itemList = updateExisting? _.sortBy(itemList, function(item) { return item.id === currentItem.id ? 0 : 1;}): itemList;
        return [true, itemList, start, end];
      }
      if(updateExisting)
        return [true, [currentItem.id], currentItem.start, currentItem.end];
    }
    return [false];
  }

  private addMarkersForSegment(segment: any, start: number, end: number) {
    if(segment.id) {
      let label = this.timelineData.getGroup(segment.group);
      let category: LabelCategoryModel = this.labelCategories.find(value => value.id == label['categoryId'] );
      if(category.isTrackable) {
        let samplingFrequency = TimelineComponent.getSamplingFrequency(category.samplingFrequency, category.samplingUnit);
        let firstMarkerTime = TimelineComponent.generateFirstMarker(samplingFrequency, start);
        let markers: {completed: boolean; start: number; labelId: any, authorId: string, authorClass: string, segmentId: any}[] = [];
        for(let i = firstMarkerTime; i<end; i = i+samplingFrequency) {
          markers.push({
            labelId: segment.group,
            start: i,
            completed: false,
            authorId: JSON.parse(localStorage.getItem('currentSession$'))['user']['id'],
            authorClass: this.userRole,
            segmentId: segment.id
          });
        }
        this.labelsService.newTrackingInstance(markers);
      }
    }
  }

  private static getSamplingFrequency(samplingFrequency: number, samplingUnit: string) {
    switch (samplingUnit) {
      case "s" :
        return samplingFrequency * 1000;
      case "ms" :
        return samplingFrequency;
      case "min" :
        return samplingFrequency * 60 * 1000;
    }
  }

  private static generateFirstMarker(samplingFrequency: number, start: number) {
    if(start % samplingFrequency == 0) {
      return start;
    }
    return start + samplingFrequency - (start % samplingFrequency);
  }
}
