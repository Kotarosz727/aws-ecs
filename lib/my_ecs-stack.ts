import { Stack, StackProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as ecs from "aws-cdk-lib/aws-ecs";
import * as ecs_patterns from "aws-cdk-lib/aws-ecs-patterns";
import * as ecr from "aws-cdk-lib/aws-ecr";

export class MyEcsStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    //vpc
    const vpc = new ec2.Vpc(this, "sbcntr", {
      cidr: '10.0.0.0/16',
      maxAzs: 2, // Default is all AZs in region
      subnetConfiguration: [
        {
          cidrMask: 24,
          name: 'ingress',
          subnetType: ec2.SubnetType.PUBLIC,
        },
        {
          cidrMask: 24,
          name: 'application',
          subnetType: ec2.SubnetType.PRIVATE_WITH_NAT,
        },
        {
          cidrMask: 24,
          name: 'egress',
          subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
        },
        {
          cidrMask: 24,
          name: 'db',
          subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
        },
     ] 
    });

    //セキュリティグループ
    const ingress_sg = new ec2.SecurityGroup(this, 'ingress_sg', {
      securityGroupName: 'ingress_sg',
      vpc: vpc
    });
    vpc.selectSubnets({ subnetGroupName: "ingress" }).subnets.forEach((x) => {
      ingress_sg.addIngressRule(ec2.Peer.ipv4(x.ipv4CidrBlock), ec2.Port.allTraffic());
    });

    const application_sg = new ec2.SecurityGroup(this, 'application-sg', {
      securityGroupName: 'application_sg',
      vpc: vpc
    });
    vpc.selectSubnets({ subnetGroupName: "application" }).subnets.forEach((x) => {
      application_sg.addIngressRule(ec2.Peer.ipv4(x.ipv4CidrBlock), ec2.Port.tcp(80));
    });

    const egress_sg = new ec2.SecurityGroup(this, 'egress_sg', {
      securityGroupName: 'egress_sg',
      vpc: vpc
    });
    vpc.selectSubnets({ subnetGroupName: "egress" }).subnets.forEach((x) => {
      egress_sg.addIngressRule(ec2.Peer.ipv4(x.ipv4CidrBlock), ec2.Port.tcp(80));
    });

    const dbSg = new ec2.SecurityGroup(this, 'sbcntr-db-sg', {
        securityGroupName: 'db-sg',
        vpc: vpc
    });
    vpc.selectSubnets({ subnetGroupName: "db" }).subnets.forEach((x) => {
      dbSg.addIngressRule(ec2.Peer.ipv4(x.ipv4CidrBlock), ec2.Port.tcp(3306));
    });

    //Interface型VPCエンドポイント
    vpc.addInterfaceEndpoint('sbcntr-vpc-log', {
      service: ec2.InterfaceVpcEndpointAwsService.CLOUDWATCH_LOGS,
      subnets: {subnetGroupName: 'egress'}
    });
    vpc.addInterfaceEndpoint('sbcntr-vpc-ecr', {
      service: ec2.InterfaceVpcEndpointAwsService.ECR,
      subnets: {subnetGroupName: 'egress'}
    });

    //Gateway型エンドポイント
    vpc.addGatewayEndpoint('sbcntr-vpc-s3', {
      service: ec2.GatewayVpcEndpointAwsService.S3,
      subnets: [{subnetType: ec2.SubnetType.PUBLIC}]
    });

    //ecr
    const backend_img = new ecr.Repository(this, 'sbcntr-backend', {
      encryption: ecr.RepositoryEncryption.KMS
    });
    const frontend_img = new ecr.Repository(this, 'sbcntr-frontend', {
      encryption: ecr.RepositoryEncryption.KMS
    })

    //クラスター
    const cluster = new ecs.Cluster(this, "sbcntr-ecs-cluster", {
      vpc: vpc
    });

    const taskDef = new ecs.FargateTaskDefinition(this, "ServiceTaskDefinition", {
      memoryLimitMiB: 512,
      cpu: 256,
    });

    taskDef.addContainer("ServiceTaskContainerDefinition", {
      image: ecs.ContainerImage.fromEcrRepository(backend_img),
    }).addPortMappings({
      containerPort: 80,
      protocol: ecs.Protocol.TCP,
    });

    // Create a load-balanced Fargate service and make it public
    new ecs_patterns.ApplicationLoadBalancedFargateService(this, "sbcntr-fargate-service", {
      serviceName: 'sbcntr-ecs-backend-service',
      cluster: cluster, // Required
      cpu: 512, // Default is 256
      desiredCount: 2, // Default is 1
      taskDefinition: taskDef,
      // taskImageOptions: { image: ecs.ContainerImage.fromRegistry("amazon/amazon-ecs-sample") },
      memoryLimitMiB: 1024, // Default is 512
      publicLoadBalancer: true, // Default is false
      loadBalancerName: 'sbcntr-alb-intrnal',
    });
  }
}
