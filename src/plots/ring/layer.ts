import { CoordinateType } from '@antv/g2/lib/plot/interface';
import * as _ from '@antv/util';
import { registerPlotType } from '../../base/global';
import { LayerConfig } from '../../base/layer';
import PieLayer, { PieViewConfig } from '../pie/layer';
import responsiveMethods from './apply-responsive';
import './apply-responsive/theme';
import * as statisticTemplate from './component/statistic-template';
import * as EventParser from './event';

export interface RingViewConfig extends PieViewConfig {
  innerRadius?: number;
  statistic?: any; //FIXME: 指标卡
}

export interface RingLayerConfig extends RingViewConfig, LayerConfig {}

interface IAttrs {
  [key: string]: any;
}

const G2_GEOM_MAP = {
  ring: 'interval',
};

const PLOT_GEOM_MAP = {
  interval: 'ring',
};

export default class RingLayer<T extends RingLayerConfig = RingLayerConfig> extends PieLayer<T> {
  public static centralId = 0;
  public type: string = 'ring';
  private statistic: any; // 保存指标卡实例用于响应交互
  private statisticClass: string; // 指标卡的class,用于重点文本容器的唯一标识，一个页面多个环图时，共用 class 交互会有问题。

  public static getDefaultOptions(): any {
    return _.deepMix({}, super.getDefaultOptions(), {
      radius: 0.8,
      innerRadius: 0.64,
      static: {
        visible: true,
        onActive: true,
      },
    });
  }

  public getOptions(props: T) {
    const options = super.getOptions(props);
    if (!props.innerRadius && props.radius) {
      return _.deepMix({}, options, {
        innerRadius: (props.radius * 0.8).toFixed(2),
      });
    }
    return options;
  }

  public beforeInit() {
    super.beforeInit();
    RingLayer.centralId++;
    this.statisticClass = `statisticClassId${RingLayer.centralId}`;
    const props = this.options;
    /** 响应式图形 */
    if (props.responsive && props.padding !== 'auto') {
      this.applyResponsive('preRender');
    }
  }

  public afterInit() {
    super.afterInit();
    /** 处理环图中心文本响应交互的问题 */
    if (this.statistic && this.statistic.visible && this.statistic.onActive) {
      this.view.on(
        'interval:mouseenter',
        _.debounce((e) => {
          const displayData = this.parseStatisticData(e.data._origin);
          const htmlString = this.getCenterHtmlString(displayData);
          document.getElementsByClassName(this.statisticClass)[0].innerHTML = htmlString;
        }, 150)
      );
      this.view.on(
        'interval:mouseleave',
        _.debounce((e) => {
          const totalValue = this.getTotalValue();
          const displayData = this.parseStatisticData(totalValue);
          const htmlString = this.getCenterHtmlString(displayData);
          document.getElementsByClassName(this.statisticClass)[0].innerHTML = htmlString;
        }, 150)
      );
    }
  }

  protected geometryParser(dim, type) {
    if (dim === 'g2') {
      return G2_GEOM_MAP[type];
    }
    return PLOT_GEOM_MAP[type];
  }

  protected coord() {
    const props = this.options;
    const coordConfig = {
      type: 'theta' as CoordinateType,
      cfg: {
        radius: props.radius,
        innerRadius: props.innerRadius,
      },
    };
    this.setConfig('coord', coordConfig);
  }

  protected annotation() {
    const annotationConfigs = [];
    const props = this.options;
    if (props.statistic && props.statistic.visible) {
      const statistic = this.drawStatistic(props.statistic);
      annotationConfigs.push(statistic);
      this.statistic = statistic;
    }
    this.setConfig('annotations', annotationConfigs);
  }

  protected parserEvents(eventParser) {
    super.parserEvents(EventParser);
  }

  private drawStatistic(config) {
    const statistic: IAttrs = {
      type: 'html',
      top: true,
      position: ['50%', '50%'],
      onActive: false,
    };
    /** 中心文本内容 */
    let displayData;
    if (config.content) {
      displayData = config.content;
    } else {
      /** 用户没有指定文本内容时，默认显示总计 */
      const data = this.getTotalValue();
      displayData = this.parseStatisticData(data);
    }
    /** 中心文本显示 */
    let htmlString;
    if (config.htmlContent) {
      htmlString = config.htmlContent(displayData);
    } else {
      htmlString = this.getStatisticTemplate(displayData);
    }
    statistic.html = htmlString;
    /** 是否响应状态量 */
    if (config.onActive) {
      statistic.onActive = config.onActive;
      this.setConfig('tooltip', false);
    }
    return statistic;
  }

  /** 获取总计数据 */
  private getTotalValue(): object {
    const props = this.options;
    let total = 0;
    props.data.forEach((item) => (total += item[props.angleField]));
    const data = {
      [props.angleField]: total,
      [props.colorField]: '总计',
    };
    return data;
  }

  private parseStatisticData(data) {
    const props = this.options;
    const angleField = props.angleField;
    return props.colorField ? { name: data[props.colorField], value: data[angleField] } : data[angleField];
  }

  private getStatisticTemplate(displayData) {
    const size = this.getStatisticSize();
    let htmlString;
    /** 如果文本内容为string或单条数据 */
    if (_.isString(displayData)) {
      htmlString = statisticTemplate.getSingleDataTemplate(displayData, this.statisticClass, size);
    } else if (_.isObject(displayData) && _.keys(displayData).length === 2) {
      /** 如果文本内容为两条数据 */
      const content = displayData as IAttrs;
      htmlString = statisticTemplate.getTwoDataTemplate(content.name, content.value, this.statisticClass, size);
    }
    /** 更为复杂的文本要求用户自行制定html模板 */
    return htmlString;
  }

  /** 获取中心文本的htmlString */
  private getCenterHtmlString(_displayData): string {
    const onActiveConfig = this.statistic.onActive;
    let htmlString: string;
    if (_.isBoolean(onActiveConfig)) {
      htmlString = this.getStatisticTemplate(_displayData);
    } else if (_.isFunction(onActiveConfig)) {
      htmlString = onActiveConfig(_displayData);
      htmlString = `<div class="ring-guide-html ${this.statisticClass}">${htmlString}</div>`;
    }
    return htmlString;
  }

  private applyResponsive(stage) {
    const methods = responsiveMethods[stage];
    _.each(methods, (r) => {
      const responsive = r as IAttrs;
      responsive.method(this);
    });
  }

  private getStatisticSize() {
    return this.width * this.options.radius;
  }
}

registerPlotType('ring', RingLayer);
