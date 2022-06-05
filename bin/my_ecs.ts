#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { MyEcsStack } from '../lib/my_ecs-stack';

const app = new cdk.App();
new MyEcsStack(app, 'MyEcsStack', {});